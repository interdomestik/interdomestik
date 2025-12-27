import { handlePaddleEvent as handlePaddleEventCore } from '@interdomestik/domain-membership-billing/paddle-webhooks/handle';

import { sendThankYouLetterCore } from '@/actions/thank-you-letter/send';
import { sendPaymentFailedEmail } from '@/lib/email';

export async function handlePaddleEvent(params: { eventType: string | undefined; data: unknown }) {
  return handlePaddleEventCore(params, {
    sendPaymentFailedEmail,
    sendThankYouLetter: sendThankYouLetterCore,
  });
}
