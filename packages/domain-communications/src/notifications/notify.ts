import { db } from '@interdomestik/database';
import { notifications } from '@interdomestik/database/schema';
import { withTenant } from '@interdomestik/database/tenant-security';
import { nanoid } from 'nanoid';
import {
  sendEmail,
  sendClaimAssignedEmail,
  sendClaimSubmittedEmail,
  sendNewMessageEmail,
  sendPaymentVerificationEmail,
  sendStatusChangedEmail,
} from '../email';
import { buildEmailTemplate, joinUrl, DEFAULT_APP_URL } from '../email/templates';
import { sendPushToUser } from '../push';
import type { AuditLogger } from '../types';

// Notification event types
export type NotificationEvent =
  | 'claim_submitted'
  | 'claim_assigned'
  | 'claim_status_changed'
  | 'claim_pack_generated'
  | 'claim_pack_upgraded'
  | 'document_requested'
  | 'triage_complete'
  | 'escalation_accepted'
  | 'escalation_declined'
  | 'new_message'
  | 'sla_warning'
  | 'sla_breached'
  | 'membership_renewal'
  | 'payment_verification_update';

type NotificationDeps = {
  sendPushToUser?: typeof sendPushToUser;
  logAuditEvent?: AuditLogger;
  tenantId?: string | null;
};

type NotificationChannelOptions = {
  tenantId?: string | null;
};

function queryUserById(userId: string, tenantId?: string | null) {
  return db.query.user.findFirst({
    where: (users, { eq }) =>
      tenantId ? withTenant(tenantId, users.tenantId, eq(users.id, userId)) : eq(users.id, userId),
    columns: { emailVerified: true, tenantId: true },
  });
}

function sendVerifiedEmail(
  userId: string,
  tenantId: string | null | undefined,
  label: string,
  dispatch: () => Promise<unknown>
) {
  queryUserById(userId, tenantId)
    .then(userRecord => {
      if (!userRecord?.emailVerified) {
        return;
      }

      return dispatch();
    })
    .catch(error => console.error(`Failed to send ${label} email:`, error));
}

function sendLifecycleEmail(
  to: string,
  props: {
    title: string;
    intro: string;
    actionUrl: string;
    ctaLabel?: string;
    details?: string[];
  }
) {
  if (!to) return Promise.resolve({ success: false as const, error: 'Missing recipient email' });

  return sendEmail(
    to,
    buildEmailTemplate({
      title: props.title,
      intro: props.intro,
      details: props.details,
      ctaLabel: props.ctaLabel ?? 'Open Interdomestik',
      ctaUrl: joinUrl(DEFAULT_APP_URL, props.actionUrl),
    })
  );
}

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
    const userRecord = await queryUserById(userId, requestedTenantId);
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
  const result = await sendNotification(
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

  if (result.success) {
    sendVerifiedEmail(userId, null, 'claim submitted', () =>
      sendClaimSubmittedEmail(userEmail, claim)
    );
  }

  return result;
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
  const result = await sendNotification(
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

  if (result.success) {
    sendVerifiedEmail(agentId, null, 'claim assigned', () =>
      sendClaimAssignedEmail(agentEmail, claim, agentName)
    );
  }

  return result;
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
  const push = deps?.sendPushToUser
    ? deps.sendPushToUser
    : (
        userId: string,
        channel: 'claim_updates' | 'messages',
        payload: Parameters<typeof sendPushToUser>[2]
      ) => sendPushToUser(userId, channel, payload, { logAuditEvent: deps?.logAuditEvent });

  const result = await sendNotification(
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
      tenantId: deps?.tenantId,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, deps?.tenantId, 'status change', () =>
      sendStatusChangedEmail(userEmail, claim, oldStatus, newStatus)
    );

    push(userId, 'claim_updates', {
      title: 'Claim Status Updated',
      body: `${claim.title}: ${oldStatus} → ${newStatus}`,
      url: `/dashboard/claims/${claim.id}`,
    }).catch(error => console.error('Failed to send status change push:', error));
  }

  return result;
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
  const push = deps?.sendPushToUser
    ? deps.sendPushToUser
    : (
        userId: string,
        channel: 'claim_updates' | 'messages',
        payload: Parameters<typeof sendPushToUser>[2]
      ) => sendPushToUser(userId, channel, payload, { logAuditEvent: deps?.logAuditEvent });

  const result = await sendNotification(
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

  if (result.success) {
    sendVerifiedEmail(recipientId, deps?.tenantId, 'new message', () =>
      sendNewMessageEmail(recipientEmail, claim, senderName, messagePreview)
    );

    push(recipientId, 'messages', {
      title: 'New Message',
      body: `${senderName}: ${messagePreview.substring(0, 100)}`,
      url: `/dashboard/claims/${claim.id}`,
    }).catch(error => console.error('Failed to send new message push:', error));
  }

  return result;
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
  const result = await sendNotification(
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

  if (result.success) {
    sendVerifiedEmail(agentId, null, 'payment verification', () =>
      sendPaymentVerificationEmail(agentEmail, props)
    );
  }

  return result;
}

/**
 * Notify user that their Claim Pack has been generated (Free Start).
 *
 * Only fires for logged-in users. Anonymous pack generation does not
 * trigger a notification because there is no userId to target.
 */
export async function notifyClaimPackGenerated(
  userId: string,
  claimCategory: string,
  confidenceLevel: string
) {
  return sendNotification(
    userId,
    'claim_pack_generated',
    {
      claimCategory,
      confidenceLevel,
    },
    {
      title: 'Your Claim Pack is ready',
      actionUrl: '/member/claims',
    }
  );
}

export async function notifyRecoveryDecision(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  decisionType: 'accepted' | 'declined',
  options?: NotificationChannelOptions
) {
  const accepted = decisionType === 'accepted';
  const event: NotificationEvent = accepted ? 'escalation_accepted' : 'escalation_declined';
  const title = accepted ? 'Recovery accepted' : 'Recovery declined';
  const intro = accepted
    ? `Staff accepted ${claim.title} for recovery handling.`
    : `Staff declined recovery handling for ${claim.title}.`;
  const actionUrl = `/member/claims/${claim.id}`;

  const result = await sendNotification(
    userId,
    event,
    {
      claimId: claim.id,
      claimTitle: claim.title,
      decisionType,
    },
    {
      title,
      actionUrl,
      tenantId: options?.tenantId,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options?.tenantId, 'recovery decision', () =>
      sendLifecycleEmail(userEmail, {
        title,
        intro,
        actionUrl,
        ctaLabel: 'View claim',
      })
    );
  }

  return result;
}

export async function notifyDocumentRequested(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  requestSummary: string,
  options?: NotificationChannelOptions
) {
  const actionUrl = `/member/claims/${claim.id}`;
  const result = await sendNotification(
    userId,
    'document_requested',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      requestSummary,
    },
    {
      title: 'Documents requested',
      actionUrl,
      tenantId: options?.tenantId,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options?.tenantId, 'document request', () =>
      sendLifecycleEmail(userEmail, {
        title: 'Documents requested',
        intro: `Staff requested more documents for ${claim.title}.`,
        details: [requestSummary],
        actionUrl,
        ctaLabel: 'Open claim',
      })
    );
  }

  return result;
}

export async function notifyTriageComplete(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  options?: NotificationChannelOptions
) {
  const actionUrl = `/member/claims/${claim.id}`;
  const result = await sendNotification(
    userId,
    'triage_complete',
    {
      claimId: claim.id,
      claimTitle: claim.title,
    },
    {
      title: 'Triage complete',
      actionUrl,
      tenantId: options?.tenantId,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options?.tenantId, 'triage complete', () =>
      sendLifecycleEmail(userEmail, {
        title: 'Triage complete',
        intro: `Staff triage is complete for ${claim.title}.`,
        actionUrl,
        ctaLabel: 'View next steps',
      })
    );
  }

  return result;
}

export async function notifySlaWarning(
  staffUserId: string,
  claim: { id: string; title: string },
  warning: string
) {
  return sendNotification(
    staffUserId,
    'sla_warning',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      warning,
    },
    {
      title: 'SLA warning',
      actionUrl: `/staff/claims/${claim.id}`,
    }
  );
}

export async function notifyMembershipRenewal(
  userId: string,
  userEmail: string,
  renewalDate: string,
  options?: NotificationChannelOptions
) {
  const actionUrl = '/member/membership';
  const result = await sendNotification(
    userId,
    'membership_renewal',
    {
      renewalDate,
    },
    {
      title: 'Membership renewal reminder',
      actionUrl,
      tenantId: options?.tenantId,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options?.tenantId, 'membership renewal', () =>
      sendLifecycleEmail(userEmail, {
        title: 'Membership renewal reminder',
        intro: `Your Asistenca membership is scheduled to renew on ${renewalDate}.`,
        actionUrl,
        ctaLabel: 'Review membership',
      })
    );
  }

  return result;
}
