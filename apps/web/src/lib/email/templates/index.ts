export { DEFAULT_APP_NAME, DEFAULT_APP_URL, buildEmailTemplate, joinUrl } from './base';
export type { EmailTemplate, TemplateOptions } from './types';

export { renderPasswordResetEmail } from './auth';
export {
  renderClaimAssignedEmail,
  renderClaimSubmittedEmail,
  renderStatusChangedEmail,
} from './claims';
export {
  renderPaymentFailedEmail,
  renderPaymentFinalWarningEmail,
  renderPaymentReminderEmail,
} from './dunning';
export {
  renderAnnualReportEmail,
  renderCheckinEmail,
  renderEngagementDay30Email,
  renderEngagementDay60Email,
  renderEngagementDay90Email,
  renderNewsletterEmail,
  renderNpsSurveyEmail,
  renderOnboardingEmail,
  renderSeasonalEmail,
  renderWelcomeEmail,
} from './engagement';
export { renderMemberWelcomeEmail } from './membership';
export { renderNewMessageEmail } from './messages';
