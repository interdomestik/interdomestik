import type { CheckoutCustomData, PaddleWebhookDeps } from '../../types';
import type { WebhookUserRecord } from './new-membership-ownership';

type ConfirmationLocale = 'en' | 'sq' | 'mk' | 'sr';
type BillingInterval = 'day' | 'week' | 'month' | 'year';

const LOCALE_TAGS: Record<ConfirmationLocale, string> = {
  en: 'en-US',
  sq: 'sq-AL',
  mk: 'mk-MK',
  sr: 'sr-Latn-RS',
};

const BILLING_INTERVALS: Record<
  ConfirmationLocale,
  Record<BillingInterval, readonly [singular: string, plural: string]>
> = {
  en: {
    day: ['day', 'days'],
    week: ['week', 'weeks'],
    month: ['month', 'months'],
    year: ['year', 'years'],
  },
  sq: {
    day: ['ditë', 'ditë'],
    week: ['javë', 'javë'],
    month: ['muaj', 'muaj'],
    year: ['vit', 'vjet'],
  },
  mk: {
    day: ['ден', 'дена'],
    week: ['недела', 'недели'],
    month: ['месец', 'месеци'],
    year: ['година', 'години'],
  },
  sr: {
    day: ['dan', 'dana'],
    week: ['nedelja', 'nedelje'],
    month: ['mesec', 'meseca'],
    year: ['godina', 'godine'],
  },
};

export const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

export async function processMembershipConfirmation(args: {
  sub: any;
  tenantId: string;
  customData: CheckoutCustomData | undefined;
  userRecord: WebhookUserRecord | null;
  deps: Pick<PaddleWebhookDeps, 'sendThankYouLetter'>;
}) {
  const { sub, tenantId, customData, userRecord, deps } = args;
  if (!deps.sendThankYouLetter || !userRecord) return;

  const confirmation = resolveProviderConfirmation({ sub, customData, userRecord });
  if (!confirmation.ok) {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; ${confirmation.reason}`
    );
    return;
  }

  try {
    const delivery = await deps.sendThankYouLetter({
      ...confirmation.value,
      tenantId,
      providerReference: sub.id,
    });
    if (!delivery?.success) {
      console.error(
        `[Webhook] Membership confirmation delivery failed for subscription ${sub.id}: ${delivery?.error ?? 'unknown delivery failure'}`
      );
      return;
    }
    console.log(`[Webhook] 📧 Thank-you Letter sent to ${redactEmail(userRecord.email)}`);
  } catch (emailError) {
    console.error('[Webhook] Failed to send Thank-you Letter:', emailError);
  }
}

function resolveProviderConfirmation(args: {
  sub: any;
  customData: CheckoutCustomData | undefined;
  userRecord: WebhookUserRecord;
}):
  | {
      ok: true;
      value: {
        email: string;
        memberName: string;
        memberNumber: string;
        planName: string;
        planPrice: string;
        planInterval: string;
        memberSince: Date;
        expiresAt: Date;
        locale: ConfirmationLocale;
      };
    }
  | { ok: false; reason: string } {
  if (args.sub.status !== 'active') return { ok: false, reason: 'provider status is not active' };

  const locale = args.customData?.locale;
  if (!locale) return { ok: false, reason: 'checkout locale is missing' };

  const email = normalizeConfirmationText(args.userRecord.email);
  const memberName = normalizeConfirmationText(args.userRecord.name);
  const memberNumber = normalizeConfirmationText(args.userRecord.memberNumber);
  if (!email || !memberName || !memberNumber) {
    return { ok: false, reason: 'authoritative member details are incomplete' };
  }

  const price = args.sub.items?.[0]?.price;
  const unitPrice = price?.unitPrice || price?.unit_price;
  const planName = normalizeConfirmationText(price?.name);
  const amount = normalizeConfirmationText(unitPrice?.amount);
  const currencyCode = normalizeConfirmationText(
    unitPrice?.currencyCode || unitPrice?.currency_code
  )?.toUpperCase();
  if (!planName || !amount || !currencyCode) {
    return { ok: false, reason: 'provider plan values are incomplete' };
  }

  const billingCycle =
    args.sub.billingCycle || args.sub.billing_cycle || price?.billingCycle || price?.billing_cycle;
  if (!billingCycle) return { ok: false, reason: 'provider billing cadence is missing' };

  const currentPeriod = args.sub.currentBillingPeriod || args.sub.current_billing_period;
  const memberSince = parseProviderDate(currentPeriod?.startsAt || currentPeriod?.starts_at);
  const expiresAt = parseProviderDate(currentPeriod?.endsAt || currentPeriod?.ends_at);
  if (!memberSince || !expiresAt || expiresAt <= memberSince) {
    return { ok: false, reason: 'provider billing period is invalid' };
  }

  const planPrice = formatProviderMoney(amount, currencyCode, locale);
  if (!planPrice) return { ok: false, reason: 'provider price is invalid' };

  const planInterval = formatBillingInterval(billingCycle.frequency, billingCycle.interval, locale);
  if (!planInterval) return { ok: false, reason: 'provider billing cadence is invalid' };

  return {
    ok: true,
    value: {
      email,
      memberName,
      memberNumber,
      planName,
      planPrice,
      planInterval,
      memberSince,
      expiresAt,
      locale,
    },
  };
}

function normalizeConfirmationText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseProviderDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatProviderMoney(
  amount: string,
  currencyCode: string,
  locale: ConfirmationLocale
): string | null {
  if (!/^\d+$/u.test(amount)) return null;
  try {
    const formatter = new Intl.NumberFormat(LOCALE_TAGS[locale], {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'code',
    });
    const minorUnits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const numericAmount = Number(amount) / 10 ** minorUnits;
    return Number.isSafeInteger(Number(amount)) ? formatter.format(numericAmount) : null;
  } catch {
    return null;
  }
}

function formatBillingInterval(
  frequency: unknown,
  interval: unknown,
  locale: ConfirmationLocale
): string | null {
  if (
    typeof frequency !== 'number' ||
    !Number.isInteger(frequency) ||
    frequency <= 0 ||
    !['day', 'week', 'month', 'year'].includes(String(interval))
  ) {
    return null;
  }
  const [singular, plural] = BILLING_INTERVALS[locale][interval as BillingInterval];
  return frequency === 1 ? singular : `${frequency} ${plural}`;
}
