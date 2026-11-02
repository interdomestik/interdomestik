import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { EventName } from '@paddle/paddle-node-sdk';
import { handleSubscriptionPastDue } from './handlers/dunning';
import { handleSubscriptionChanged } from './handlers/subscriptions';
import { handleTransactionCompleted } from './handlers/transaction';

import type { PaddleWebhookAuditDeps, PaddleWebhookDeps } from './types';

export async function handlePaddleEvent(
  params: {
    eventType: string | undefined;
    data: unknown;
    /** Verified-delivery capability from `verifyPaddleWebhook`; every tenant authority derives from it. */
    delivery: IngressCapability<'paddle-delivery'>;
    /** Authority of the tenant the core resolved from a subscription or user owner, when it did. */
    authority?: TenantAuthority | null;
    processingScopeKey?: string;
    providerEventId?: string;
    providerEventOccurredAt?: string | null;
    webhookPayloadHash?: string;
  },
  deps: PaddleWebhookDeps & PaddleWebhookAuditDeps = {}
) {
  const eventType = params.eventType;

  if (!eventType) {
    console.log('[Webhook] Missing event type');
    return;
  }

  switch (eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
    case EventName.SubscriptionPaused:
    case EventName.SubscriptionResumed: {
      await handleSubscriptionChanged(
        {
          eventType,
          data: params.data,
          delivery: params.delivery,
          authority: params.authority,
          processingScopeKey: params.processingScopeKey,
          providerEventId: params.providerEventId,
          providerEventOccurredAt: params.providerEventOccurredAt,
          webhookPayloadHash: params.webhookPayloadHash,
        },
        deps
      );
      break;
    }

    case EventName.SubscriptionPastDue: {
      await handleSubscriptionPastDue(
        {
          data: params.data,
          delivery: params.delivery,
          authority: params.authority,
          processingScopeKey: params.processingScopeKey,
          providerEventId: params.providerEventId,
          providerEventOccurredAt: params.providerEventOccurredAt,
        },
        deps
      );
      break;
    }

    case EventName.TransactionCompleted: {
      await handleTransactionCompleted({ data: params.data, delivery: params.delivery }, deps);
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${eventType}`);
      break;
  }
}
