import { EventName } from '@paddle/paddle-node-sdk';
import { handleSubscriptionPastDue } from './handlers/dunning';
import { handleSubscriptionChanged } from './handlers/subscriptions';
import { handleTransactionCompleted } from './handlers/transaction';

export async function handlePaddleEvent(params: { eventType: string | undefined; data: unknown }) {
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
      await handleSubscriptionChanged({ eventType, data: params.data });
      break;
    }

    case EventName.SubscriptionPastDue: {
      await handleSubscriptionPastDue({ data: params.data });
      break;
    }

    case EventName.TransactionCompleted: {
      await handleTransactionCompleted({ data: params.data });
      break;
    }

    default:
      console.log(`[Webhook] Unhandled event type: ${eventType}`);
      break;
  }
}
