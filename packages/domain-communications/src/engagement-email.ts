import { sendEmail } from './email';
import type { EmailResult } from './sign-in-otp-email';
import {
  renderWelcomeEmail,
  renderOnboardingEmail,
  renderCheckinEmail,
  renderEngagementDay30Email,
  renderEngagementDay60Email,
  renderEngagementDay90Email,
  renderNewsletterEmail,
  renderSeasonalEmail,
  renderNpsSurveyEmail,
} from './email-templates';

// ============================================================================
// PHASE 5: ENGAGEMENT & RETENTION EMAILS
// ============================================================================

export async function sendWelcomeEmail(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderWelcomeEmail({ name }));
}

export async function sendOnboardingEmail(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderOnboardingEmail({ name }));
}

export async function sendCheckinEmail(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderCheckinEmail({ name }));
}

export async function sendEngagementDay30Email(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay30Email({ name }));
}

export async function sendEngagementDay60Email(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay60Email({ name }));
}

export async function sendEngagementDay90Email(to: string, name: string): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderEngagementDay90Email({ name }));
}

export async function sendNewsletterEmail(
  to: string,
  props: Parameters<typeof renderNewsletterEmail>[0]
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderNewsletterEmail(props));
}

export async function sendSeasonalEmail(
  to: string,
  props: Parameters<typeof renderSeasonalEmail>[0]
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderSeasonalEmail(props));
}

export async function sendNpsSurveyEmail(
  to: string,
  props: { name: string; token: string }
): Promise<EmailResult> {
  if (!to) return { success: false, error: 'Missing recipient email' };
  return sendEmail(to, renderNpsSurveyEmail(props));
}
