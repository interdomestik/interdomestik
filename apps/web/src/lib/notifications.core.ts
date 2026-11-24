export {
  notifyNewMessage,
  notifyDocumentRequested,
  notifyPaymentVerificationUpdate,
} from './notifications/content-notifications';

import {
  clearSupportHandoffPublicResponseNotifications as clearSupportHandoffPublicResponseNotificationsDomain,
  notifyClaimAssigned as notifyClaimAssignedDomain,
  notifyClaimPackGenerated as notifyClaimPackGeneratedDomain,
  notifyMembershipRenewal as notifyMembershipRenewalDomain,
  notifySlaWarning as notifySlaWarningDomain,
  notifyTriageComplete as notifyTriageCompleteDomain,
  sendNotification as sendNotificationDomain,
} from '@interdomestik/domain-communications/notifications';
import type { NotificationEvent } from '@interdomestik/domain-communications/notifications';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

export type { NotificationEvent } from '@interdomestik/domain-communications/notifications';

type TenantNotificationOptions = { authority: TenantAuthority };

export function sendNotification(
  userId: string,
  event: NotificationEvent,
  payload: Record<string, string | number | boolean>,
  options: {
    actionUrl?: string;
    title?: string;
    authority: TenantAuthority;
  }
) {
  return sendNotificationDomain(userId, event, payload, options);
}

export function notifyClaimAssigned(
  agentId: string,
  agentEmail: string,
  claim: { id: string; title: string },
  agentName: string,
  options: TenantNotificationOptions
) {
  return notifyClaimAssignedDomain(agentId, agentEmail, claim, agentName, options);
}

export function notifyClaimPackGenerated(
  userId: string,
  claimCategory: string,
  confidenceLevel: string,
  options: TenantNotificationOptions
) {
  return notifyClaimPackGeneratedDomain(userId, claimCategory, confidenceLevel, options);
}

export function clearSupportHandoffPublicResponseNotifications(
  memberId: string,
  handoff: { id: string },
  options: { authority: TenantAuthority }
) {
  return clearSupportHandoffPublicResponseNotificationsDomain(memberId, handoff, options);
}

export function notifyTriageComplete(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  options: TenantNotificationOptions
) {
  return notifyTriageCompleteDomain(userId, userEmail, claim, options);
}

export function notifySlaWarning(
  staffUserId: string,
  claim: { id: string; title: string },
  warning: string,
  options: TenantNotificationOptions
) {
  return notifySlaWarningDomain(staffUserId, claim, warning, options);
}

export function notifyMembershipRenewal(
  userId: string,
  userEmail: string,
  renewalDate: string,
  options: TenantNotificationOptions
) {
  return notifyMembershipRenewalDomain(userId, userEmail, renewalDate, options);
}
