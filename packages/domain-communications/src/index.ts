export type { AuditEvent, AuditLogger, Session, SessionUser } from './types';

export { getMessagesForClaimCore } from './messages/get';
export { markMessagesAsReadCore } from './messages/mark-read';
export { normalizeSelectedMessages } from './messages/normalize';
export { sendMessageDbCore } from './messages/send';
export type { MessageWithSender, SelectedMessageRow } from './messages/types';

export { getNotificationsCore } from './notifications/get';
export { markAllAsReadCore, markAsReadCore } from './notifications/mark-read';
export {
  notifyClaimAssigned,
  notifyClaimSubmitted,
  notifyNewMessage,
  notifyStatusChanged,
  sendNotification,
} from './notifications/notify';

export type { NotificationEvent } from './notifications/notify';

export { sendPushToUser } from './push';
export type { PushPayload } from './push';

export {
  sendAnnualReportEmail,
  sendCheckinEmail,
  sendClaimAssignedEmail,
  sendClaimSubmittedEmail,
  sendEmail,
  sendEngagementDay30Email,
  sendEngagementDay60Email,
  sendEngagementDay90Email,
  sendMemberWelcomeEmail,
  sendNewMessageEmail,
  sendNewsletterEmail,
  sendNpsSurveyEmail,
  sendOnboardingEmail,
  sendPasswordResetEmail,
  sendPaymentFailedEmail,
  sendPaymentFinalWarningEmail,
  sendPaymentReminderEmail,
  sendSeasonalEmail,
  sendStatusChangedEmail,
  sendWelcomeEmail,
} from './email';

export type { EmailTemplate, TemplateOptions } from './email/templates';
export { renderThankYouLetterEmail } from './email/thank-you-letter';
export type { ThankYouLetterParams } from './email/thank-you-letter';

export {
  DEFAULT_APP_NAME,
  DEFAULT_APP_URL,
  buildEmailTemplate,
  joinUrl,
  renderAnnualReportEmail,
  renderCheckinEmail,
  renderClaimAssignedEmail,
  renderClaimSubmittedEmail,
  renderEngagementDay30Email,
  renderEngagementDay60Email,
  renderEngagementDay90Email,
  renderMemberWelcomeEmail,
  renderNewMessageEmail,
  renderNewsletterEmail,
  renderNpsSurveyEmail,
  renderOnboardingEmail,
  renderPasswordResetEmail,
  renderPaymentFailedEmail,
  renderPaymentFinalWarningEmail,
  renderPaymentReminderEmail,
  renderSeasonalEmail,
  renderStatusChangedEmail,
  renderWelcomeEmail,
} from './email/templates';

export { forEachBatchedUsers, processBatchedUserCampaign } from './campaign-execution';

export { processEmailSequences } from './cron-service';
