import { isAutomatedEmail as isAutomated, selectEmailRecipients } from './non-sending-email';
import { automatedSmtpTarget, smtpTransport } from './sign-in-otp-email';
import {
  DeliveryTimeout,
  withDeliveryTimeout,
  type DeliveryFailure,
  type DeliveryOutcome,
} from './delivery-outcome';
import {
  emailTimeoutFailure,
  sendResendOutcome,
  smtpDeliveryFailure,
} from './email-delivery-outcome';
import type { EmailTemplate } from './email/templates/types';

export function configuredSmtpTarget(automatedCatcher: boolean) {
  if (isAutomated()) return automatedCatcher ? automatedSmtpTarget() : null;
  const host = process.env.SMTP_HOST;
  return host ? { host, port: Number.parseInt(process.env.SMTP_PORT || '1025') } : null;
}

export function getSenderAddress() {
  return (
    process.env.RESEND_FROM_EMAIL ||
    process.env.RESEND_FROM ||
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL ||
    'Interdomestik <no-reply@interdomestik.com>'
  );
}

export type EmailTransport = 'smtp' | 'resend';

export function configuredEmailTransports(): EmailTransport[] {
  const transports: EmailTransport[] = [];
  const target = configuredSmtpTarget(true);
  if (target && target !== 'rejected') transports.push('smtp');
  if (!isAutomated() && process.env.RESEND_API_KEY) transports.push('resend');
  return transports;
}

export async function sendEmailOutcome(
  transport: EmailTransport,
  recipient: string,
  rendered: EmailTemplate,
  { idempotencyKey, timeoutMs }: { idempotencyKey: string; timeoutMs: number }
): Promise<DeliveryOutcome<EmailTransport>> {
  const to = selectEmailRecipients(recipient);
  if (!to || typeof to !== 'string') {
    return {
      ok: false,
      retryable: false,
      ambiguous: false,
      preAcceptance: false,
      code: 'email_suppressed',
      detail: 'email_suppressed',
    };
  }

  const { subject, html, text } = rendered;
  const mail = {
    from: getSenderAddress(),
    to,
    subject: subject.replace(/[\r\n]/g, ''),
    html,
    text,
  };
  const unavailable = {
    ok: false,
    retryable: true,
    ambiguous: false,
    preAcceptance: false,
    code: 'email_unconfigured',
    detail: 'email_unconfigured',
  } as const;
  if (!configuredEmailTransports().includes(transport)) return unavailable;

  try {
    return await withDeliveryTimeout(timeoutMs, async signal => {
      if (transport === 'resend') {
        const apiKey = process.env.RESEND_API_KEY;
        return apiKey ? sendResendOutcome(apiKey, mail, idempotencyKey, signal) : unavailable;
      }
      const target = configuredSmtpTarget(true);
      if (!target || target === 'rejected') return unavailable;
      const client = smtpTransport(target, signal);
      try {
        const receipt = await client.sendMail(mail);
        if (!receipt?.accepted?.length) return smtpDeliveryFailure(undefined);
        return { ok: true, transport: 'smtp' };
      } catch (error) {
        signal.throwIfAborted();
        const failure = smtpDeliveryFailure(error);
        console.error({ code: failure.code });
        return failure;
      }
    });
  } catch (error) {
    const failure: DeliveryFailure =
      error instanceof DeliveryTimeout
        ? emailTimeoutFailure(transport)
        : {
            ok: false,
            retryable: true,
            ambiguous: true,
            preAcceptance: false,
            code: 'email_failed',
            detail: transport,
          };
    console.error({ code: failure.code });
    return failure;
  }
}
