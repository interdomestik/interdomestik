import {
  notifyClaimAssigned as notifyClaimAssignedDomain,
  notifyClaimSubmitted as notifyClaimSubmittedDomain,
  notifyNewMessage as notifyNewMessageDomain,
  notifyPaymentVerificationUpdate as notifyPaymentVerificationUpdateDomain,
  notifyStatusChanged as notifyStatusChangedDomain,
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
  newStatus: string
) {
  return notifyStatusChangedDomain(userId, userEmail, claim, oldStatus, newStatus, {
    sendPushToUser,
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
