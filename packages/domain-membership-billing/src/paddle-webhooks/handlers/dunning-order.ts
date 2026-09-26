import { and, db, eq, subscriptions, type DomainEventTx } from '@interdomestik/database';

import {
  lockSubscriptionEventOrder,
  type PaddleSubscriptionEventOrder,
} from './subscription-event-order';

/** Dunning state read under the row lock of the ordered past-due write. */
export type LockedDunningState = {
  id: string;
  tenantId: string;
  userId: string;
  dunningAttemptCount: number | null;
  pastDueAt: Date | null;
  gracePeriodEndsAt: Date | null;
};

export type OrderedPastDueResult<TState> =
  { kind: 'apply'; state: TState } | { kind: 'replayed' | 'stale' };

/**
 * Applies an entity-scoped `subscription.past_due` snapshot to the exact existing
 * provider subscription row. The ordering decision, dunning counters derived from the
 * locked row and the ordering marker commit in one transaction; stale and replayed
 * events write nothing.
 */
export async function persistOrderedPastDueSubscription<
  TState extends { values: Partial<typeof subscriptions.$inferInsert> },
>(args: {
  order: PaddleSubscriptionEventOrder;
  providerSubscriptionId: string;
  subscriptionId: string;
  tenantId: string;
  buildState: (locked: LockedDunningState) => TState;
}): Promise<OrderedPastDueResult<TState>> {
  // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains the locked dunning update.
  return db.transaction(async (tx): Promise<OrderedPastDueResult<TState>> => {
    const decision = await lockSubscriptionEventOrder(tx as DomainEventTx, {
      order: args.order,
      providerSubscriptionId: args.providerSubscriptionId,
      requireExactAggregate: true,
      subscriptionId: args.subscriptionId,
      tenantId: args.tenantId,
    });
    if (decision.kind !== 'apply') return { kind: decision.kind };

    const rowScope = and(
      eq(subscriptions.id, args.subscriptionId),
      eq(subscriptions.tenantId, args.tenantId)
    );
    // db-access-guard: tenant-scoped -- reason: row already locked by this tenant-scoped transaction.
    const [locked] = await tx
      .select({
        id: subscriptions.id,
        tenantId: subscriptions.tenantId,
        userId: subscriptions.userId,
        dunningAttemptCount: subscriptions.dunningAttemptCount,
        pastDueAt: subscriptions.pastDueAt,
        gracePeriodEndsAt: subscriptions.gracePeriodEndsAt,
      })
      .from(subscriptions)
      .where(rowScope);
    if (!locked) {
      throw new Error(`Paddle subscription ${args.providerSubscriptionId} lost its locked row`);
    }

    const state = args.buildState(locked);
    // db-access-guard: tenant-scoped -- reason: tenantId from canonical Paddle context constrains dunning update.
    const updatedRows = await tx
      .update(subscriptions)
      .set({
        ...state.values,
        providerEventOccurredAt: args.order.occurredAt,
        providerEventId: args.order.providerEventId,
      })
      .where(rowScope)
      .returning({ id: subscriptions.id });
    if (updatedRows.length !== 1) {
      throw new Error(
        `Paddle subscription ${args.providerSubscriptionId} dunning update matched no tenant-scoped row`
      );
    }
    return { kind: 'apply', state };
  });
}
