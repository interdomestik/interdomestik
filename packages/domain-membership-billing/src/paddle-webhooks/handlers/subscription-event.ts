import { appendEvent, type DomainEventTx } from '@interdomestik/database';

import type { InternalSubscriptionStatus } from '../subscription-status';

export type SubscriptionEventStatus = InternalSubscriptionStatus | 'none';

/** Appends the change event through the borrowed transaction, passed on its own. */
export async function recordMembershipSubscriptionChangedEvent(
  tx: DomainEventTx,
  params: {
    actor?: { id: string; role: string };
    cancelAtPeriodEnd: boolean;
    correlationId?: string;
    id?: string;
    fromStatus: SubscriptionEventStatus;
    now: Date;
    subscriptionId: string;
    tenantId: string;
    toStatus: InternalSubscriptionStatus;
  }
) {
  await appendEvent(tx, {
    actor: params.actor ?? { id: 'paddle-webhook', role: 'system' },
    aggregateVersion: 0,
    correlationId:
      params.correlationId ??
      `membership:${params.subscriptionId}:subscription-changed:${crypto.randomUUID()}`,
    ...(params.id ? { id: params.id } : {}),
    createdAt: params.now,
    entity: { id: params.subscriptionId, type: 'subscription' },
    eventName: 'membership.subscription_changed',
    eventVersion: 1,
    payload: {
      cancelAtPeriodEnd: params.cancelAtPeriodEnd,
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
    },
    tenantId: params.tenantId,
  });
}
