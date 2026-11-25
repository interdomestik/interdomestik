import {
  renderCheckinEmail,
  renderEngagementDay30Email,
  renderEngagementDay60Email,
  renderEngagementDay90Email,
  renderNewsletterEmail,
  renderNpsSurveyEmail,
  renderOnboardingEmail,
  renderSeasonalEmail,
  renderWelcomeEmail,
  type EmailTemplate,
} from './email-templates';
import type { EmailResult } from './sign-in-otp-email';

export function createEngagementEmailSenders(
  sendEmail: (to: string, template: EmailTemplate) => Promise<EmailResult>
) {
  return {
    async sendWelcomeEmail(to: string, name: string): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderWelcomeEmail({ name }));
    },

    async sendOnboardingEmail(to: string, name: string): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderOnboardingEmail({ name }));
    },

    async sendCheckinEmail(to: string, name: string): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderCheckinEmail({ name }));
    },

    async sendEngagementDay30Email(to: string, name: string): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderEngagementDay30Email({ name }));
    },

    async sendEngagementDay60Email(to: string, name: string): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderEngagementDay60Email({ name }));
    },

    async sendEngagementDay90Email(to: string, name: string): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderEngagementDay90Email({ name }));
    },

    async sendNewsletterEmail(
      to: string,
      props: Parameters<typeof renderNewsletterEmail>[0]
    ): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderNewsletterEmail(props));
    },

    async sendSeasonalEmail(
      to: string,
      props: Parameters<typeof renderSeasonalEmail>[0]
    ): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderSeasonalEmail(props));
    },

    async sendNpsSurveyEmail(
      to: string,
      props: { name: string; token: string }
    ): Promise<EmailResult> {
      if (!to) return { success: false, error: 'Missing recipient email' };
      return sendEmail(to, renderNpsSurveyEmail(props));
    },
  };
}
