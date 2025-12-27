import { buildEmailTemplate, DEFAULT_APP_URL, joinUrl } from './base';

export function renderPaymentFailedEmail(params: {
  memberName: string;
  planName: string;
  gracePeriodDays: number;
  gracePeriodEndDate: string;
}) {
  const updatePaymentUrl = joinUrl(DEFAULT_APP_URL, '/member/membership');
  return buildEmailTemplate({
    title: '⚠️ Payment Failed - Action Required',
    intro: `Hi ${params.memberName}, your payment for ${params.planName} was unsuccessful. Please update your payment method to continue enjoying your membership benefits.`,
    details: [
      `Plan: ${params.planName}`,
      `Grace Period: ${params.gracePeriodDays} days`,
      `Access expires: ${params.gracePeriodEndDate}`,
    ],
    ctaLabel: 'Update Payment Method',
    ctaUrl: updatePaymentUrl,
    footer: `Your membership benefits are still active during the grace period. Update your payment to avoid interruption.`,
  });
}

export function renderPaymentReminderEmail(params: {
  memberName: string;
  planName: string;
  daysRemaining: number;
  gracePeriodEndDate: string;
}) {
  const updatePaymentUrl = joinUrl(DEFAULT_APP_URL, '/member/membership');
  return buildEmailTemplate({
    title: `⏰ ${params.daysRemaining} Days Left to Update Payment`,
    intro: `Hi ${params.memberName}, this is a reminder that your payment for ${params.planName} is still pending. You have ${params.daysRemaining} days left to update your payment method before losing access.`,
    details: [
      `Plan: ${params.planName}`,
      `Days Remaining: ${params.daysRemaining}`,
      `Access expires: ${params.gracePeriodEndDate}`,
    ],
    ctaLabel: 'Update Payment Now',
    ctaUrl: updatePaymentUrl,
    footer: `Don't lose access to your 24/7 emergency hotline, legal consultations, and other benefits!`,
  });
}

export function renderPaymentFinalWarningEmail(params: {
  memberName: string;
  planName: string;
  gracePeriodEndDate: string;
}) {
  const updatePaymentUrl = joinUrl(DEFAULT_APP_URL, '/member/membership');
  return buildEmailTemplate({
    title: '🚨 FINAL WARNING: Membership Expires Tomorrow',
    intro: `Hi ${params.memberName}, your grace period for ${params.planName} ends TOMORROW. If payment is not updated, your membership will be suspended and you will lose access to all benefits.`,
    details: [
      `Plan: ${params.planName}`,
      `⚠️ ACCESS EXPIRES: ${params.gracePeriodEndDate}`,
      'Without membership: No emergency hotline, no legal support',
    ],
    ctaLabel: 'UPDATE PAYMENT NOW',
    ctaUrl: updatePaymentUrl,
    footer: `This is your final reminder. After tomorrow, you'll need to re-subscribe to regain access.`,
  });
}
