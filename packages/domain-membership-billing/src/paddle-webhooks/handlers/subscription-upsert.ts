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
  sub: any;
  tenantId: string;
  userId: string;
};

export async function upsertSubscription(args: UpsertSubscriptionArgs) {
  const { sub, tenantId, userId, agentId, branchId, existingSub, mappedStatus, planState } = args;
  const values = mapToSubscriptionValues(sub, mappedStatus, planState);
  const existingSubscription =
    existingSub ?? (await findExistingSubscriptionForUser(userId, tenantId));

  if (existingSubscription) {
    await persistSubscriptionUpdate(existingSubscription, {
      agentId,
      branchId,
      sub,
      tenantId,
      userId,
      values,
    });
    return existingSubscription.id;
  }

  try {
    await persistSubscriptionInsert({ agentId, branchId, sub, tenantId, userId, values });
    return sub.id as string;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const racedSubscription = await findExistingSubscription(sub.id, userId, tenantId);
    if (!racedSubscription) throw error;

    await persistSubscriptionUpdate(racedSubscription, {
      agentId,
      branchId,
      sub,
      tenantId,
      userId,
      values,
    });
    return racedSubscription.id;
  }
}

async function persistSubscriptionInsert(args: {
  agentId?: string | null;
  branchId?: string;
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
