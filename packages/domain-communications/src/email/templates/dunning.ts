import type { EmailTemplate } from './types';
import { buildEmailTemplate, DEFAULT_APP_URL, joinUrl } from './base';

export function renderPaymentFailedEmail(params: {
  accessContinues?: boolean;
  locale?: string;
  memberName: string;
  planName: string;
  gracePeriodDays: number;
  gracePeriodEndDate: string;
}): EmailTemplate {
  if (params.accessContinues) return renderPaymentFacts(params);
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
  accessContinues?: boolean;
  locale?: string;
  memberName: string;
  planName: string;
  daysRemaining: number;
  gracePeriodEndDate: string;
}): EmailTemplate {
  if (params.accessContinues) return renderPaymentFacts(params);
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
  accessContinues?: boolean;
  locale?: string;
  memberName: string;
  planName: string;
  gracePeriodEndDate: string;
}): EmailTemplate {
  if (params.accessContinues) return renderPaymentFacts(params);
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

const PAYMENT_FACTS = {
  en: {
    title: 'Payment pending — update your payment method',
    intro: (name: string, plan: string) =>
      `Hi ${name}, your payment for ${plan} is still pending. Please review your payment method.`,
    plan: 'Plan',
    end: 'Payment grace period ends',
    days: 'Days remaining',
    cta: 'Update Payment Method',
    footer: 'This reminder concerns your subscription payment.',
  },
  sq: {
    title: 'Pagesë në pritje — përditësoni mënyrën e pagesës',
    intro: (name: string, plan: string) =>
      `Përshëndetje ${name}, pagesa juaj për ${plan} është ende në pritje. Ju lutemi kontrolloni mënyrën e pagesës.`,
    plan: 'Plani',
    end: 'Afati shtesë i pagesës përfundon',
    days: 'Ditë të mbetura',
    cta: 'Përditësoni mënyrën e pagesës',
    footer: 'Ky rikujtim ka të bëjë me pagesën e abonimit tuaj.',
  },
  mk: {
    title: 'Плаќање во исчекување — ажурирајте го начинот на плаќање',
    intro: (name: string, plan: string) =>
      `Здраво ${name}, вашето плаќање за ${plan} сè уште е во исчекување. Проверете го начинот на плаќање.`,
    plan: 'План',
    end: 'Дополнителниот рок за плаќање завршува',
    days: 'Преостанати денови',
    cta: 'Ажурирајте го начинот на плаќање',
    footer: 'Овој потсетник се однесува на плаќањето на вашата претплата.',
  },
  sr: {
    title: 'Plaćanje na čekanju — ažurirajte način plaćanja',
    intro: (name: string, plan: string) =>
      `Zdravo ${name}, vaše plaćanje za ${plan} je i dalje na čekanju. Proverite način plaćanja.`,
    plan: 'Plan',
    end: 'Dodatni rok za plaćanje ističe',
    days: 'Preostali dani',
    cta: 'Ažurirajte način plaćanja',
    footer: 'Ovaj podsetnik se odnosi na plaćanje vaše pretplate.',
  },
  de: {
    title: 'Zahlung ausstehend — Zahlungsmethode aktualisieren',
    intro: (name: string, plan: string) =>
      `Hallo ${name}, Ihre Zahlung für ${plan} steht noch aus. Bitte überprüfen Sie Ihre Zahlungsmethode.`,
    plan: 'Tarif',
    end: 'Zahlungsfrist endet',
    days: 'Verbleibende Tage',
    cta: 'Zahlungsmethode aktualisieren',
    footer: 'Diese Erinnerung betrifft Ihre Abonnementzahlung.',
  },
};

function renderPaymentFacts(params: {
  locale?: string;
  memberName: string;
  planName: string;
  gracePeriodEndDate: string;
  daysRemaining?: number;
  gracePeriodDays?: number;
}): EmailTemplate {
  const locale = params.locale;
  const copy =
    locale === 'sq' || locale === 'mk' || locale === 'sr' || locale === 'de'
      ? PAYMENT_FACTS[locale]
      : PAYMENT_FACTS.en;
  const days = params.daysRemaining ?? params.gracePeriodDays;
  return buildEmailTemplate({
    title: copy.title,
    intro: copy.intro(params.memberName, params.planName),
    details: [
      `${copy.plan}: ${params.planName}`,
      `${copy.end}: ${params.gracePeriodEndDate}`,
      ...(days === undefined ? [] : [`${copy.days}: ${days}`]),
    ],
    ctaLabel: copy.cta,
    ctaUrl: joinUrl(DEFAULT_APP_URL, '/member/membership'),
    footer: copy.footer,
  });
}
