import { handleSubscriptionChanged as handleSubscriptionChangedCore } from '@interdomestik/domain-membership-billing/paddle-webhooks/handlers/subscriptions';

import { sendThankYouLetterCore } from '@/actions/thank-you-letter/send';

export async function handleSubscriptionChanged(params: { eventType: string; data: unknown }) {
  return handleSubscriptionChangedCore(params, { sendThankYouLetter: sendThankYouLetterCore });
}
