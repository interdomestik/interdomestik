import { handleSubscriptionPastDue as handleSubscriptionPastDueCore } from '@interdomestik/domain-membership-billing/paddle-webhooks/handlers/dunning';

import { sendPaymentFailedEmail } from '@/lib/email';

export async function handleSubscriptionPastDue(params: { data: unknown }) {
  return handleSubscriptionPastDueCore(params, { sendPaymentFailedEmail });
}
