import {
  notifyClaimAssigned as notifyClaimAssignedDomain,
  notifyClaimPackGenerated as notifyClaimPackGeneratedDomain,
  notifyClaimSubmitted as notifyClaimSubmittedDomain,
  notifyDocumentRequested as notifyDocumentRequestedDomain,
  notifyMembershipRenewal as notifyMembershipRenewalDomain,
  notifyNewMessage as notifyNewMessageDomain,
  notifyPaymentVerificationUpdate as notifyPaymentVerificationUpdateDomain,
  notifyRecoveryDecision as notifyRecoveryDecisionDomain,
  notifySlaWarning as notifySlaWarningDomain,
  notifyStatusChanged as notifyStatusChangedDomain,
  notifyTriageComplete as notifyTriageCompleteDomain,
  sendNotification as sendNotificationDomain,
} from '@interdomestik/domain-communications/notifications';
import type { NotificationEvent } from '@interdomestik/domain-communications/notifications';

import { sendPushToUser } from '@/lib/push';

export type { NotificationEvent } from '@interdomestik/domain-communications/notifications';

export function sendNotification(
  userId: string,
  event: NotificationEvent,
  payload: Record<string, string | number | boolean>,
  options?: {
    actionUrl?: string;
    title?: string;
    tenantId?: string | null;
  }
) {
  return sendNotificationDomain(userId, event, payload, options);
}

export function notifyClaimSubmitted(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string; category: string }
) {
  return notifyClaimSubmittedDomain(userId, userEmail, claim);
}

export function notifyClaimAssigned(
  agentId: string,
  agentEmail: string,
  claim: { id: string; title: string },
  agentName: string
) {
  return notifyClaimAssignedDomain(agentId, agentEmail, claim, agentName);
}

export function notifyStatusChanged(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  oldStatus: string,
  newStatus: string,
  options?: { tenantId?: string | null }
) {
  return notifyStatusChangedDomain(userId, userEmail, claim, oldStatus, newStatus, {
    sendPushToUser,
    tenantId: options?.tenantId,
  });
}

export function notifyNewMessage(
  recipientId: string,
  recipientEmail: string,
  claim: { id: string; title: string },
  senderName: string,
  messagePreview: string
) {
  return notifyNewMessageDomain(recipientId, recipientEmail, claim, senderName, messagePreview, {
    sendPushToUser,
  });
}

export function notifyPaymentVerificationUpdate(
  agentId: string,
  agentEmail: string,
  props: {
    leadName: string;
    amount: number;
    currency: string;
    status: 'needs_info' | 'rejected';
    note?: string;
    link: string;
  }
) {
  return notifyPaymentVerificationUpdateDomain(agentId, agentEmail, props);
}

export function notifyClaimPackGenerated(
  userId: string,
  claimCategory: string,
  confidenceLevel: string
) {
  return notifyClaimPackGeneratedDomain(userId, claimCategory, confidenceLevel);
}

export function notifyRecoveryDecision(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  decisionType: 'accepted' | 'declined',
  options?: { tenantId?: string | null }
) {
  return notifyRecoveryDecisionDomain(userId, userEmail, claim, decisionType, options);
}

export function notifyDocumentRequested(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  requestSummary: string
) {
  return notifyDocumentRequestedDomain(userId, userEmail, claim, requestSummary);
}

export function notifyTriageComplete(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string }
) {
  return notifyTriageCompleteDomain(userId, userEmail, claim);
}

export function notifySlaWarning(
  staffUserId: string,
  claim: { id: string; title: string },
  warning: string
) {
  return notifySlaWarningDomain(staffUserId, claim, warning);
}

export function notifyMembershipRenewal(userId: string, userEmail: string, renewalDate: string) {
  return notifyMembershipRenewalDomain(userId, userEmail, renewalDate);
}
