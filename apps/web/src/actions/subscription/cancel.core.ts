import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { PADDLE_CLOSED } from '@interdomestik/domain-membership-billing/paddle-closed';
import { cancelSubscriptionCore as cancelSubscriptionCoreDomain } from '@interdomestik/domain-membership-billing/subscription/cancel';
import type {
  CancelSubscriptionResult,
  SubscriptionDeps,
  SubscriptionSession,
} from '@interdomestik/domain-membership-billing/subscription/types';

import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { subscriptionClosedFailure } from './paddle-closed';

export async function cancelSubscriptionCore(
  params: {
    idempotencyKey?: string;
    session: SubscriptionSession | null;
    authority: TenantAuthority | null;
    subscriptionId: string;
    now?: Date;
  },
  deps: SubscriptionDeps = {}
) {
  if (PADDLE_CLOSED) {
    return subscriptionClosedFailure();
  }

  if (!params.session?.user || !params.authority) {
    return { error: 'Unauthorized', success: undefined };
  }

  return runCommercialActionWithIdempotency({
    action: 'subscription.cancel',
    scope: {
      kind: 'tenant',
      actorUserId: params.session?.user?.id ?? null,
      authority: params.authority,
    },
    idempotencyKey: params.idempotencyKey,
    requestFingerprint: {
      subscriptionId: params.subscriptionId,
      actorUserId: params.session?.user?.id ?? null,
    },
    execute: () =>
      cancelSubscriptionCoreDomain(
        {
          session: params.session,
          authority: params.authority,
          subscriptionId: params.subscriptionId,
          now: params.now,
        },
        deps
      ),
  }) as Promise<CancelSubscriptionResult>;
}
