import { and, db, eq, subscriptions, type DomainEventTx } from '@interdomestik/database';

import { findSubscriptionByProviderReference } from '../../subscription';
import type { InternalSubscriptionStatus } from '../subscription-status';
import { recordMembershipSubscriptionChangedEvent } from './subscription-event';
import {
  lockSubscriptionEventOrder,
  type PaddleSubscriptionEventOrder,
  type SubscriptionEventOrderDecision,
} from './subscription-event-order';
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
  /** Signed provider ordering evidence; required on the entity-scoped path. */
  order?: PaddleSubscriptionEventOrder;
  planState: CanonicalMembershipPlanState;
  providerEventId?: string;
  sub: any;
  tenantId: string;
  userId: string;
};

type SubscriptionWriteArgs = {
  agentId?: string | null;
  branchId?: string;
  eventId?: string;
  order?: PaddleSubscriptionEventOrder;
  sub: any;
  tenantId: string;
  userId: string;
  values: ReturnType<typeof mapToSubscriptionValues>;
};

/** `stale` marks an older provider event that wrote nothing and must emit no effects. */
export type UpsertSubscriptionResult = {
  subscriptionId: string;
  effectsApplied: boolean;
  stale?: true;
};

export async function upsertSubscription(
  args: UpsertSubscriptionArgs
): Promise<UpsertSubscriptionResult> {
  const {
    sub,
    tenantId,
    userId,
    agentId,
    branchId,
    existingSub,
    mappedStatus,
    order,
    planState,
    providerEventId,
  } = args;
  const values = mapToSubscriptionValues(sub, mappedStatus, planState);
  const existingSubscription = await resolveSubscriptionForUpsert({
    existingSub,
    tenantId,
    userId,
  });
  const eventId = deterministicSubscriptionEventId(
    tenantId,
    order?.providerEventId ?? providerEventId
  );
  const writeArgs = { agentId, branchId, eventId, order, sub, tenantId, userId, values };

  if (existingSubscription) {
    return persistExistingSubscription(existingSubscription, writeArgs);
  }

  try {
    await persistSubscriptionInsert(writeArgs);
    return { subscriptionId: sub.id as string, effectsApplied: true };
  } catch (error) {
    return recoverSubscriptionInsert(error, writeArgs);
  }
}

async function recoverSubscriptionInsert(
  error: unknown,
  args: SubscriptionWriteArgs
): Promise<UpsertSubscriptionResult> {
  const replay = isDomainEventReplay(error, args.eventId);
  if (!replay && !isUniqueViolation(error)) throw error;
  const existing = await findExistingSubscription(args.sub.id, args.userId, args.tenantId);
  if (replay) {
    if (!existing) throw error;
    return { subscriptionId: existing.id, effectsApplied: false };
  }
  if (!existing) throw error;
  return persistExistingSubscription(existing, args);
}

async function persistExistingSubscription(
  subscription: ExistingSubscription,
  args: SubscriptionWriteArgs
): Promise<UpsertSubscriptionResult> {
  try {
    const outcome = await persistSubscriptionUpdate(subscription, args);
    if (outcome === 'stale') {
      return { subscriptionId: subscription.id, effectsApplied: false, stale: true };
    }
    return { subscriptionId: subscription.id, effectsApplied: outcome === 'apply' };
  } catch (error) {
    if (!isDomainEventReplay(error, args.eventId)) throw error;
    return { subscriptionId: subscription.id, effectsApplied: false };
  }
}

export async function resolveSubscriptionForUpsert(args: {
  existingSub?: ExistingSubscription | null;
  tenantId: string;
  userId: string;
}): Promise<ExistingSubscription | null | undefined> {
  return args.existingSub ?? findExistingSubscriptionForUser(args.userId, args.tenantId);
}

async function persistSubscriptionInsert(args: SubscriptionWriteArgs) {
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
      ...providerEventOrderValues(args.order),
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
  args: SubscriptionWriteArgs
): Promise<SubscriptionEventOrderDecision['kind']> {
  assertSubscriptionMatchesContext(subscription, {
    subId: args.sub.id,
    tenantId: args.tenantId,
    userId: args.userId,
  });
  return db.transaction(async (tx): Promise<SubscriptionEventOrderDecision['kind']> => {
    let fromStatus = subscription.status;
    if (args.order) {
      // The ordering decision, snapshot, marker and domain event commit atomically
      // under the row lock; an older concurrent event re-reads the newer marker.
      const decision = await lockSubscriptionEventOrder(tx as DomainEventTx, {
        domainEventId: subscriptionChangedEventId(args.tenantId, args.order.providerEventId),
        order: args.order,
        providerSubscriptionId: args.sub.id,
        subscriptionId: subscription.id,
        tenantId: args.tenantId,
      });
      if (decision.kind !== 'apply') return decision.kind;
      fromStatus = decision.fromStatus;
    }
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
        ...providerEventOrderValues(args.order),
      })
      .where(and(eq(subscriptions.id, subscription.id), eq(subscriptions.tenantId, args.tenantId)))
      .returning({ id: subscriptions.id });
    if (updatedRows.length !== 1)
      throw new Error(`Paddle subscription ${args.sub.id} update matched no tenant-scoped row`);
    await recordMembershipSubscriptionChangedEvent({
      cancelAtPeriodEnd: args.values.cancelAtPeriodEnd,
      fromStatus: normalizeExistingStatus(fromStatus),
      id: args.eventId,
      now: args.values.updatedAt,
      subscriptionId: subscription.id,
      tenantId: args.tenantId,
      toStatus: args.values.status,
      tx: tx as DomainEventTx,
    });
    return 'apply';
  });
}

function providerEventOrderValues(order: PaddleSubscriptionEventOrder | undefined) {
  return order
    ? { providerEventOccurredAt: order.occurredAt, providerEventId: order.providerEventId }
    : {};
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
  return providerEventId ? subscriptionChangedEventId(tenantId, providerEventId) : undefined;
}

function subscriptionChangedEventId(tenantId: string, providerEventId: string): string {
  return `paddle:${tenantId}:${providerEventId}:subscription-changed`;
}

function isDomainEventReplay(error: unknown, eventId: string | undefined): boolean {
  if (!eventId || !isUniqueViolation(error)) return false;
  const candidate = error as { constraint?: unknown; constraint_name?: unknown };
  const constraint = candidate.constraint ?? candidate.constraint_name;
  return constraint === 'domain_events_pkey' || constraint === 'domain_events_tenant_id_id_uq';
}
