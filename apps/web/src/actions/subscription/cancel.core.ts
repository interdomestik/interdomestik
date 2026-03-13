import { cancelSubscriptionCore as cancelSubscriptionCoreDomain } from '@interdomestik/domain-membership-billing/subscription/cancel';
import type {
  CancelSubscriptionResult,
  SubscriptionDeps,
  SubscriptionSession,
} from '@interdomestik/domain-membership-billing/subscription/types';

import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';

export async function cancelSubscriptionCore(
  params: {
    idempotencyKey?: string;
    session: SubscriptionSession | null;
    subscriptionId: string;
    now?: Date;
  },
  deps: SubscriptionDeps = {}
): Promise<CancelSubscriptionResult> {
  return runCommercialActionWithIdempotency({
    action: 'subscription.cancel',
    actorUserId: params.session?.user?.id ?? null,
    tenantId: params.session?.user?.tenantId ?? null,
    idempotencyKey: params.idempotencyKey,
    requestFingerprint: {
      subscriptionId: params.subscriptionId,
      actorUserId: params.session?.user?.id ?? null,
    },
    execute: () =>
      cancelSubscriptionCoreDomain(
        {
          session: params.session,
          subscriptionId: params.subscriptionId,
          now: params.now,
        },
        deps
      ),
  }) as Promise<CancelSubscriptionResult>;
}
