import type { Resend } from 'resend';

export const SIGN_IN_OTP_LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

export type SignInOtpLocale = (typeof SIGN_IN_OTP_LOCALES)[number];
export type EmailTelemetryPolicy = 'content-free';

type EmailDeliveryEvent = Readonly<{
  provider: 'mock' | 'smtp' | 'resend' | 'none';
  outcome: 'sent' | 'failed' | 'fallback' | 'unavailable';
  category?: 'client_initialization' | 'delivery' | 'missing_provider';
}>;
type EmailProvider = EmailDeliveryEvent['provider'];
type DefaultLog = () => void;

export type EmailTelemetry = Readonly<{
  contentFree: boolean;
  sent: (provider: EmailProvider, defaultLog?: DefaultLog) => void;
  failed: (
    provider: EmailProvider,
    category: NonNullable<EmailDeliveryEvent['category']>,
    defaultLog?: DefaultLog
  ) => void;
  fallback: (provider: EmailProvider, defaultLog?: DefaultLog) => void;
  unavailable: (provider: EmailProvider, defaultLog?: DefaultLog) => void;
}>;
export type EmailResult = { success: true; id: string } | { success: false; error: string };
export type EmailSendOptions = {
  attachments?: { filename: string; content: Buffer | string }[];
  telemetryPolicy?: EmailTelemetryPolicy;
};

type SignInOtpCopy = Readonly<{
  subject: string;
  body: string;
}>;

const COPY: Record<SignInOtpLocale, SignInOtpCopy> = {
  sq: {
    subject: 'Kodi juaj për konfirmimin e email-it',
    body: 'Përdoreni kodin me 6 shifra për të konfirmuar email-in dhe për të vazhduar. Vlen 5 minuta; vlen vetëm kodi më i ri. Nuk konfirmon pagesë, anëtarësi aktive, kërkesë për dëm apo rast të pranuar.',
  },
  en: {
    subject: 'Your email confirmation code',
    body: 'Use the 6-digit code to confirm your email and continue. It expires in 5 minutes; only the newest code works. It does not confirm payment, active membership, a claim, or an accepted case.',
  },
  sr: {
    subject: 'Kod za potvrdu e-adrese',
    body: 'Upotrebite kod od 6 cifara da potvrdite e-adresu i nastavite. Važi 5 minuta; važi samo najnoviji kod. Ne potvrđuje uplatu, aktivno članstvo, zahtev niti prihvaćen predmet.',
  },
  mk: {
    subject: 'Код за потврда на е-поштата',
    body: 'Користете го 6-цифрениот код за да ја потврдите е-поштата и да продолжите. Важи 5 минути; важи само најновиот код. Не потврдува плаќање, активно членство, барање за надомест или прифатен случај.',
  },
};

export function createEmailTelemetry(policy?: EmailTelemetryPolicy): EmailTelemetry {
  const contentFree = policy === 'content-free';
  const emit = (
    level: 'log' | 'warn' | 'error',
    event: EmailDeliveryEvent,
    defaultLog?: DefaultLog
  ) => {
    if (contentFree) console[level]('[EmailDelivery]', event);
    else defaultLog?.();
  };

  return {
    contentFree,
    sent: (provider, defaultLog) => emit('log', { provider, outcome: 'sent' }, defaultLog),
    failed: (provider, category, defaultLog) =>
      emit('error', { provider, outcome: 'failed', category }, defaultLog),
    fallback: (provider, defaultLog) =>
      emit('warn', { provider, outcome: 'fallback', category: 'delivery' }, defaultLog),
    unavailable: (provider, defaultLog) =>
      emit('warn', { provider, outcome: 'unavailable', category: 'missing_provider' }, defaultLog),
  };
}

export async function sendViaResend(
  client: Resend,
  from: string,
  to: string,
  template: { subject: string; html: string; text: string },
  options: EmailSendOptions,
  telemetry: EmailTelemetry
): Promise<EmailResult> {
  const fail = (error: unknown, fallback: string): EmailResult => {
    telemetry.failed('resend', 'delivery', () => console.error('Resend error:', error));
    const providerError = error instanceof Error ? error.message : fallback;
    return {
      success: false,
      error: telemetry.contentFree ? 'email_provider_failed' : providerError,
    };
  };
  try {
    const response = await client.emails.send({
      from,
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      attachments: options.attachments,
    });
    if (response.error) return fail(response.error, 'Email delivery failed');
    if (!response.data?.id) {
      return fail('No email ID returned from Resend', 'No email ID returned from Resend');
    }
    telemetry.sent('resend');
    return { success: true, id: response.data.id };
  } catch (error) {
    return fail(error, 'Email delivery failed');
  }
}

export function normalizeSignInOtpLocale(value: unknown): SignInOtpLocale {
  return typeof value === 'string' && SIGN_IN_OTP_LOCALES.includes(value as SignInOtpLocale)
    ? (value as SignInOtpLocale)
    : 'en';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderSignInOtpEmail(otp: string, locale: SignInOtpLocale) {
  const copy = COPY[locale];
  const safeOtp = escapeHtml(otp);

  return {
    subject: copy.subject,
    html: [
      '<div style="font-family: sans-serif; padding: 20px; color: #0f172a;">',
      `<h2 style="margin: 0 0 16px;">${copy.subject}</h2>`,
      `<p style="margin: 0 0 16px;">${copy.body}</p>`,
      `<div style="font-size: 32px; font-weight: 700; letter-spacing: 0.24em; margin: 24px 0; color: #0f172a;">${safeOtp}</div>`,
      '</div>',
    ].join(''),
    text: `${copy.body}\n\n${otp}`,
  };
}
