import { db } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { nanoid } from 'nanoid';
import {
  sendClaimAssignedEmail,
  sendClaimSubmittedEmail,
  sendNewMessageEmail,
  sendPaymentVerificationEmail,
  sendStatusChangedEmail,
} from '../email';
import { sendPushToUser } from '../push';
import type { AuditLogger } from '../types';

// Notification event types
export type NotificationEvent =
  | 'claim_submitted'
  | 'claim_assigned'
  | 'claim_status_changed'
  | 'new_message'
  | 'sla_warning'
  | 'sla_breached'
  | 'payment_verification_update';

type NotificationDeps = {
  sendPushToUser?: typeof sendPushToUser;
  logAuditEvent?: AuditLogger;
};

/**
 * Send a notification (In-app DB + Email is handled in notify functions)
 */
export async function sendNotification(
  userId: string,
  event: NotificationEvent,
  payload: Record<string, string | number | boolean>,
  options?: {
    actionUrl?: string;
    title?: string;
    tenantId?: string | null;
  }
) {
  try {
    const requestedTenantId = options?.tenantId ?? null;
    const userRecord = await db.query.user.findFirst({
      where: (users, { eq }) =>
        requestedTenantId
          ? withTenant(requestedTenantId, users.tenantId, eq(users.id, userId))
          : eq(users.id, userId),
      columns: { tenantId: true },
    });
    const resolvedTenantId = userRecord?.tenantId;

    if (!resolvedTenantId) {
      return { success: false, error: 'Missing tenantId for notification' };
    }
    if (requestedTenantId && resolvedTenantId !== requestedTenantId) {
      return { success: false, error: 'Tenant mismatch for notification' };
    }

    const title = options?.title ?? event.replaceAll('_', ' ').toUpperCase();
    const content = payload.claimTitle
      ? `Update on: ${payload.claimTitle}`
      : `New update: ${event}`;

    await db.insert(notifications).values({
      id: `ntf_${nanoid()}`,
      tenantId: resolvedTenantId,
      userId,
      type: event,
      title,
      content,
      actionUrl: options?.actionUrl || null,
      isRead: false,
    });

    return { success: true };
  } catch (error) {
    console.error(`Failed to create in-app notification [${event}]:`, error);
    return { success: false, error: 'Database error' };
  }
}

/**
 * Notify member about claim submission
 */
export async function notifyClaimSubmitted(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string; category: string }
) {
  sendClaimSubmittedEmail(userEmail, claim).catch(error =>
    console.error('Failed to send claim submitted email:', error)
  );

  return sendNotification(
    userId,
    'claim_submitted',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      category: claim.category,
    },
    {
      title: 'Claim Submitted',
      actionUrl: `/dashboard/claims/${claim.id}`,
    }
  );
}

/**
 * Notify agent about new claim assignment
 */
export async function notifyClaimAssigned(
  agentId: string,
  agentEmail: string,
  claim: { id: string; title: string },
  agentName: string
) {
  sendClaimAssignedEmail(agentEmail, claim, agentName).catch(error =>
    console.error('Failed to send claim assigned email:', error)
  );

  return sendNotification(
    agentId,
    'claim_assigned',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      agentName,
    },
    {
      title: 'New Claim Assigned',
      actionUrl: `/staff/claims/${claim.id}`,
    }
  );
}

/**
 * Notify member about claim status change
 */
export async function notifyStatusChanged(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  oldStatus: string,
  newStatus: string,
  deps?: NotificationDeps
) {
  sendStatusChangedEmail(userEmail, claim, oldStatus, newStatus).catch(error =>
    console.error('Failed to send status change email:', error)
  );

  const push = deps?.sendPushToUser
    ? deps.sendPushToUser
    : (
        userId: string,
        channel: 'claim_updates' | 'messages',
        payload: Parameters<typeof sendPushToUser>[2]
      ) => sendPushToUser(userId, channel, payload, { logAuditEvent: deps?.logAuditEvent });

  push(userId, 'claim_updates', {
    title: 'Claim Status Updated',
    body: `${claim.title}: ${oldStatus} → ${newStatus}`,
    url: `/dashboard/claims/${claim.id}`,
  }).catch(error => console.error('Failed to send status change push:', error));

  return sendNotification(
    userId,
    'claim_status_changed',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      oldStatus,
      newStatus,
    },
    {
      title: 'Claim Status Updated',
      actionUrl: `/dashboard/claims/${claim.id}`,
    }
  );
}

/**
 * Notify user about new message on their claim
 */
export async function notifyNewMessage(
  recipientId: string,
  recipientEmail: string,
  claim: { id: string; title: string },
  senderName: string,
  messagePreview: string,
  deps?: NotificationDeps
) {
  sendNewMessageEmail(recipientEmail, claim, senderName, messagePreview).catch(error =>
    console.error('Failed to send new message email:', error)
  );

  const push = deps?.sendPushToUser
    ? deps.sendPushToUser
    : (
        userId: string,
        channel: 'claim_updates' | 'messages',
        payload: Parameters<typeof sendPushToUser>[2]
      ) => sendPushToUser(userId, channel, payload, { logAuditEvent: deps?.logAuditEvent });

  push(recipientId, 'messages', {
    title: 'New Message',
    body: `${senderName}: ${messagePreview.substring(0, 100)}`,
    url: `/dashboard/claims/${claim.id}`,
  }).catch(error => console.error('Failed to send new message push:', error));

  return sendNotification(
    recipientId,
    'new_message',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      senderName,
      messagePreview: messagePreview.substring(0, 100),
    },
    {
      title: 'New Message',
      actionUrl: `/dashboard/claims/${claim.id}`,
    }
  );
}

/**
 * Notify agent about payment verification update
 */
export async function notifyPaymentVerificationUpdate(
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
  sendPaymentVerificationEmail(agentEmail, props).catch(error =>
    console.error('Failed to send payment verification email:', error)
  );

  return sendNotification(
    agentId,
    'payment_verification_update',
    {
      leadName: props.leadName,
      status: props.status,
      note: props.note || '',
    },
    {
      title: `Payment ${props.status === 'needs_info' ? 'Needs Info' : 'Rejected'}`,
      actionUrl: props.link,
    }
  );
}
