import { Resend } from 'resend';
import { isAutomatedEmail as isAutomated, type EmailRecipients } from './non-sending-email';
import { createEmailTelemetry, type EmailResult, type EmailTelemetry } from './sign-in-otp-email';

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

export function getResendProvider(telemetry: EmailTelemetry) {
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

export function unconfiguredEmailResult(
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
