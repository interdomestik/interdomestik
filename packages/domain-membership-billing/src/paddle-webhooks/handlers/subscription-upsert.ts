import { and, db, eq, subscriptions, type DomainEventTx } from '@interdomestik/database';

import { findSubscriptionByProviderReference } from '../../subscription';
import type { InternalSubscriptionStatus } from '../subscription-status';
import { recordMembershipSubscriptionChangedEvent } from './subscription-event';
import {
  assertSubscriptionMatchesContext,
  isUniqueViolation,
  mapToSubscriptionValues,
  normalizeExistingStatus,
  type CanonicalMembershipPlanState,
  type ExistingSubscription,
} from './subscription-values';

type UpsertSubscriptionArgs = {
  agentId?: string | null;
  branchId?: string;
  existingSub?: ExistingSubscription | null;
  mappedStatus: InternalSubscriptionStatus;
  planState: CanonicalMembershipPlanState;
  providerEventId?: string;
  sub: any;
  tenantId: string;
  userId: string;
};

export async function upsertSubscription(args: UpsertSubscriptionArgs) {
  const {
    sub,
    tenantId,
    userId,
    agentId,
    branchId,
    existingSub,
    mappedStatus,
    planState,
    providerEventId,
  } = args;
  const values = mapToSubscriptionValues(sub, mappedStatus, planState);
  const existingSubscription = await resolveSubscriptionForUpsert({
    existingSub,
    tenantId,
    userId,
  });
  const eventId = deterministicSubscriptionEventId(tenantId, providerEventId);

  if (existingSubscription) {
    try {
      await persistSubscriptionUpdate(existingSubscription, {
        agentId,
        branchId,
        eventId,
        sub,
        tenantId,
        userId,
        values,
      });
      return { subscriptionId: existingSubscription.id, effectsApplied: true };
    } catch (error) {
      if (!isDomainEventReplay(error, eventId)) throw error;
      return { subscriptionId: existingSubscription.id, effectsApplied: false };
    }
  }

  try {
    await persistSubscriptionInsert({ agentId, branchId, eventId, sub, tenantId, userId, values });
    return { subscriptionId: sub.id as string, effectsApplied: true };
  } catch (error) {
    if (isDomainEventReplay(error, eventId)) {
      const replayedSubscription = await findExistingSubscription(sub.id, userId, tenantId);
      if (!replayedSubscription) throw error;
      return { subscriptionId: replayedSubscription.id, effectsApplied: false };
    }
    if (!isUniqueViolation(error)) throw error;

    const racedSubscription = await findExistingSubscription(sub.id, userId, tenantId);
    if (!racedSubscription) throw error;

    try {
      await persistSubscriptionUpdate(racedSubscription, {
        agentId,
        branchId,
        eventId,
        sub,
        tenantId,
        userId,
        values,
      });
      return { subscriptionId: racedSubscription.id, effectsApplied: true };
    } catch (updateError) {
      if (!isDomainEventReplay(updateError, eventId)) throw updateError;
      return { subscriptionId: racedSubscription.id, effectsApplied: false };
    }
  }
}

export async function resolveSubscriptionForUpsert(args: {
  existingSub?: ExistingSubscription | null;
  tenantId: string;
  userId: string;
}): Promise<ExistingSubscription | null | undefined> {
  return args.existingSub ?? findExistingSubscriptionForUser(args.userId, args.tenantId);
}

async function persistSubscriptionInsert(args: {
  agentId?: string | null;
  branchId?: string;
  eventId?: string;
  sub: any;
  tenantId: string;
  userId: string;
  values: ReturnType<typeof mapToSubscriptionValues>;
}) {
  // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values.
  await db.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context is inserted.
    await tx.insert(subscriptions).values({
      id: args.sub.id,
      tenantId: args.tenantId,
      userId: args.userId,
      agentId: args.agentId,
      branchId: args.branchId,
      providerSubscriptionId: args.sub.id,
      ...args.values,
    });
    await recordMembershipSubscriptionChangedEvent({
      cancelAtPeriodEnd: args.values.cancelAtPeriodEnd,
      fromStatus: 'none',
      id: args.eventId,
      now: args.values.updatedAt,
      subscriptionId: args.sub.id,
      tenantId: args.tenantId,
      toStatus: args.values.status,
      tx: tx as DomainEventTx,
    });
  });
}

async function persistSubscriptionUpdate(
  subscription: ExistingSubscription,
  args: Omit<Parameters<typeof persistSubscriptionInsert>[0], 'values'> & {
    values: ReturnType<typeof mapToSubscriptionValues>;
  }
) {
  assertSubscriptionMatchesContext(subscription, {
    subId: args.sub.id,
    tenantId: args.tenantId,
    userId: args.userId,
  });
  await db.transaction(async tx => {
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains update.
    const updatedRows = await tx
      .update(subscriptions)
      .set({
        tenantId: args.tenantId,
        userId: args.userId,
        agentId: args.agentId,
        branchId: args.branchId,
        providerSubscriptionId: args.sub.id,
        ...args.values,
      })
      .where(and(eq(subscriptions.id, subscription.id), eq(subscriptions.tenantId, args.tenantId)))
      .returning({ id: subscriptions.id });
    if (updatedRows.length !== 1)
      throw new Error(`Paddle subscription ${args.sub.id} update matched no tenant-scoped row`);
    await recordMembershipSubscriptionChangedEvent({
      cancelAtPeriodEnd: args.values.cancelAtPeriodEnd,
      fromStatus: normalizeExistingStatus(subscription.status),
      id: args.eventId,
      now: args.values.updatedAt,
      subscriptionId: subscription.id,
      tenantId: args.tenantId,
      toStatus: args.values.status,
      tx: tx as DomainEventTx,
    });
  });
}

async function findExistingSubscription(subId: string, userId: string, tenantId: string) {
  return (
    (await findSubscriptionByProviderReference(subId, { tenantId })) ??
    (await findExistingSubscriptionForUser(userId, tenantId))
  );
}

async function findExistingSubscriptionForUser(userId: string, tenantId: string) {
  // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains fallback lookup.
  return db.query.subscriptions.findFirst({
    where: (subs, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(subs.userId, userId), eqFn(subs.tenantId, tenantId)),
    columns: { id: true, status: true, tenantId: true, userId: true },
  });
}

function deterministicSubscriptionEventId(
  tenantId: string,
  providerEventId: string | undefined
): string | undefined {
  return providerEventId ? `paddle:${tenantId}:${providerEventId}:subscription-changed` : undefined;
}

function isDomainEventReplay(error: unknown, eventId: string | undefined): boolean {
  if (!eventId || !isUniqueViolation(error)) return false;
  const candidate = error as { constraint?: unknown; constraint_name?: unknown };
  const constraint = candidate.constraint ?? candidate.constraint_name;
  return constraint === 'domain_events_pkey' || constraint === 'domain_events_tenant_id_id_uq';
}
