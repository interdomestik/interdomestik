import {
  isAutomatedEmail as isAutomated,
  selectEmailRecipients,
  suppressedEmailResult,
  type EmailRecipients,
} from './non-sending-email';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { configuredSmtpTarget, getSenderAddress } from './email-transport';
import {
  createEmailTelemetry,
  fallbackResend,
  smtpTransport,
  sendViaResend,
  type EmailResult,
  type EmailSendOptions,
  type EmailTelemetry,
} from './sign-in-otp-email';

let resendClient: Resend | null = null;
export function getResendClient(telemetry = createEmailTelemetry()) {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  try {
    resendClient = new Resend(apiKey);
    return resendClient;
  } catch (error) {
    telemetry.failed('resend', 'client_initialization', () =>
      console.warn('Failed to initialize Resend client:', error)
    );
    return null;
  }
}
function getEmailClient(telemetry: EmailTelemetry, options: EmailSendOptions) {
  const target = configuredSmtpTarget(options.automatedCatcher ?? false);
  if (target === 'rejected') return target;
  if (target) {
    return {
      type: 'smtp' as const,
      client: smtpTransport(target),
      ...(isAutomated() && { testOnly: true }),
    };
  }
  if (isAutomated()) return null;

  if (!process.env.RESEND_API_KEY) {
    telemetry.unavailable('none', () =>
      console.warn('Resend API key not configured. Emails will be skipped.')
    );
    return null;
  }

  const resend = getResendClient(telemetry);
  if (resend) return { type: 'resend' as const, client: resend };

  return null;
}
function unconfiguredEmailResult(
  to: EmailRecipients,
  template: { subject: string },
  telemetry: EmailTelemetry
): EmailResult {
  // If testing and no provider, just mock success
  if (isAutomated()) {
    telemetry.sent('mock', () =>
      console.log(`[MockEmail] To: ${to}, Subject: ${template.subject}`)
    );
    return { success: true, id: 'mock-id' };
  }
  return { success: false, error: 'Email provider not configured' };
}

export async function sendEmail(
  recipients: EmailRecipients,
  template: { subject: string; html: string; text: string },
  options: EmailSendOptions = {}
): Promise<EmailResult> {
  const to = selectEmailRecipients(recipients, options.automatedCatcher);
  if (!to) return suppressedEmailResult;
  const telemetry = createEmailTelemetry(options.telemetryPolicy);
  const provider = getEmailClient(telemetry, options);
  if (provider === 'rejected') return { success: false, error: 'Email provider not configured' };
  if (!provider) return unconfiguredEmailResult(to, template, telemetry);

  try {
    if (provider.type === 'smtp') {
      if (options.canDispatch?.() === false) {
        return { success: false, error: 'email_dispatch_blocked' };
      }
      try {
        const info = await (provider.client as nodemailer.Transporter).sendMail({
          from: getSenderAddress(),
          to,
          subject: template.subject,
          html: template.html,
          text: template.text,
          attachments: options.attachments,
        });
        telemetry.sent('smtp', () => console.log(`[SMTP] Email sent to ${to}: ${info.messageId}`));
        return { success: true, id: info.messageId };
      } catch (smtpError) {
        const resend = fallbackResend(provider, () => getResendClient(telemetry));
        if (!resend) throw smtpError;

        telemetry.fallback('smtp', () =>
          console.warn('SMTP delivery failed, falling back to Resend:', smtpError)
        );
        return sendViaResend(resend, getSenderAddress(), to, template, options, telemetry);
      }
    } else {
      const client = provider.client as Resend;
      return sendViaResend(client, getSenderAddress(), to, template, options, telemetry);
    }
  } catch (error) {
    telemetry.failed(provider.type === 'smtp' ? 'smtp' : 'resend', 'delivery', () =>
      console.error('Failed to send email:', error)
    );
    return { success: false, error: 'Failed to send email' };
  }
}
