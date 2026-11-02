import { notifications } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq, like } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  sendClaimAssignedEmail,
  sendClaimSubmittedEmail,
  sendNewMessageEmail,
  sendPaymentVerificationEmail,
  sendStatusChangedEmail,
} from '../email';
import { sendPushToUser } from '../push';
import {
  queryUserById,
  resolveNotificationContent,
  sendLifecycleEmail,
  sendVerifiedEmail,
} from './notify-helpers';
import type {
  NotificationChannelOptions,
  NotificationDeps,
  NotificationEvent,
} from './notify-types';

export type { NotificationEvent } from './notify-types';

/**
 * Send a notification (In-app DB + Email is handled in notify functions)
 */
export async function sendNotification(
  userId: string,
  event: NotificationEvent,
  payload: Record<string, string | number | boolean>,
  options: {
    actionUrl?: string;
    content?: string;
    notificationId?: string;
    title?: string;
    authority: TenantAuthority;
  }
) {
  try {
    const { authority } = options;
    if (!authority) {
      return { success: false, error: 'Missing tenant authority for notification' };
    }
    const requestedTenantId = readTenantAuthority(authority).tenantId;
    const userRecord = await queryUserById(userId, authority);
    const resolvedTenantId = userRecord?.tenantId;

    if (!resolvedTenantId) {
      return { success: false, error: 'Recipient not found in tenant' };
    }
    if (resolvedTenantId !== requestedTenantId) {
      return { success: false, error: 'Tenant mismatch for notification' };
    }

    const title = options.title ?? event.replaceAll('_', ' ').toUpperCase();
    const content = resolveNotificationContent(event, payload, options.content);

    // db-access-guard: tenant-scoped -- reason: tenantId from validated session or authScope in current call path
    await withTenantAuthority(authority, async tx => {
      const insertNotification = tx.insert(notifications).values({
        id: options.notificationId ?? `ntf_${nanoid()}`,
        tenantId: resolvedTenantId,
        userId,
        type: event,
        title,
        content,
        actionUrl: options.actionUrl || null,
        isRead: false,
      });

      if (options.notificationId) {
        await insertNotification.onConflictDoNothing({ target: notifications.id });
      } else {
        await insertNotification;
      }
    });

    return { success: true };
  } catch (error) {
    console.error(`Failed to create in-app notification [${event}]:`, error);
    return { success: false, error: 'Database error' };
  }
}

/**
 * Notify a member that staff sent or updated the latest public support handoff response.
 *
 * This is intentionally in-app only for P32-CRM07; email, push, acknowledgements,
 * and support-handoff-specific unread semantics remain out of scope.
 */
export async function notifySupportHandoffPublicResponse(
  memberId: string,
  handoff: { id: string; publicResponseVersion: number },
  options: {
    actionUrl?: string;
    content?: string;
    authority: TenantAuthority;
    title?: string;
  }
) {
  const { tenantId } = readTenantAuthority(options.authority);
  return sendNotification(
    memberId,
    'support_handoff_public_response',
    {
      handoffId: handoff.id,
      publicResponseVersion: handoff.publicResponseVersion,
    },
    {
      actionUrl: options.actionUrl ?? '/member/help',
      content: options.content ?? 'A staff update is available on your support request.',
      notificationId: `ntf_support_handoff_${tenantId}_${handoff.id}_${handoff.publicResponseVersion}`,
      authority: options.authority,
      title: options.title ?? 'Staff update available',
    }
  );
}

export async function clearSupportHandoffPublicResponseNotifications(
  memberId: string,
  handoff: { id: string },
  options: { authority: TenantAuthority }
) {
  try {
    const { tenantId } = readTenantAuthority(options.authority);
    await withTenantAuthority(options.authority, tx =>
      tx
        .delete(notifications)
        .where(
          withTenant(
            tenantId,
            notifications.tenantId,
            and(
              eq(notifications.userId, memberId),
              eq(notifications.type, 'support_handoff_public_response'),
              like(notifications.id, `ntf_support_handoff_${tenantId}_${handoff.id}_%`)
            )
          )
        )
    );

    return { success: true };
  } catch (error) {
    console.error('Failed to clear support handoff public response notifications:', error);
    return { success: false, error: 'Database error' };
  }
}

/**
 * Notify member about claim submission
 */
export async function notifyClaimSubmitted(
  userId: string,
  _userEmail: string,
  claim: { id: string; title: string; category: string },
  options: NotificationChannelOptions
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
      actionUrl: `/member/claims/${claim.id}`,
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options.authority, 'claim submitted', verifiedEmail =>
      sendClaimSubmittedEmail(verifiedEmail, claim)
    );
  }

  return result;
}

/**
 * Notify agent about new claim assignment
 */
export async function notifyClaimAssigned(
  agentId: string,
  _agentEmail: string,
  claim: { id: string; title: string },
  agentName: string,
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(agentId, options.authority, 'claim assigned', verifiedEmail =>
      sendClaimAssignedEmail(verifiedEmail, claim, agentName)
    );
  }

  return result;
}

/**
 * Notify member about claim status change
 */
export async function notifyStatusChanged(
  userId: string,
  _userEmail: string,
  claim: { id: string; title: string },
  oldStatus: string,
  newStatus: string,
  deps: NotificationDeps
) {
  const push = (
    userId: string,
    channel: 'claim_updates' | 'messages',
    payload: Parameters<typeof sendPushToUser>[2]
  ) =>
    (deps.sendPushToUser ?? sendPushToUser)(userId, channel, payload, {
      logAuditEvent: deps.logAuditEvent,
      authority: deps.authority,
    });

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
      actionUrl: `/member/claims/${claim.id}`,
      authority: deps.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, deps.authority, 'status change', verifiedEmail =>
      sendStatusChangedEmail(verifiedEmail, claim, oldStatus, newStatus)
    );

    push(userId, 'claim_updates', {
      title: 'Claim Status Updated',
      body: `${claim.title}: ${oldStatus} → ${newStatus}`,
      url: `/member/claims/${claim.id}`,
    }).catch(error => console.error('Failed to send status change push:', error));
  }

  return result;
}

/**
 * Notify user about new message on their claim
 */
export async function notifyNewMessage(
  recipientId: string,
  _recipientEmail: string,
  claim: { id: string; title: string },
  senderName: string,
  messagePreview: string,
  deps: NotificationDeps
) {
  const push = (
    userId: string,
    channel: 'claim_updates' | 'messages',
    payload: Parameters<typeof sendPushToUser>[2]
  ) =>
    (deps.sendPushToUser ?? sendPushToUser)(userId, channel, payload, {
      logAuditEvent: deps.logAuditEvent,
      authority: deps.authority,
    });

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
      authority: deps.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(recipientId, deps.authority, 'new message', verifiedEmail =>
      sendNewMessageEmail(verifiedEmail, claim, senderName, messagePreview)
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
  _agentEmail: string,
  props: {
    leadName: string;
    amount: number;
    currency: string;
    status: 'needs_info' | 'rejected';
    note?: string;
    link: string;
  },
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(agentId, options.authority, 'payment verification', verifiedEmail =>
      sendPaymentVerificationEmail(verifiedEmail, props)
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
  confidenceLevel: string,
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );
}

export async function notifyRecoveryDecision(
  userId: string,
  _userEmail: string,
  claim: { id: string; title: string },
  decisionType: 'accepted' | 'declined',
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options.authority, 'recovery decision', verifiedEmail =>
      sendLifecycleEmail(verifiedEmail, {
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
  _userEmail: string,
  claim: { id: string; title: string },
  requestSummary: string,
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options.authority, 'document request', verifiedEmail =>
      sendLifecycleEmail(verifiedEmail, {
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
  _userEmail: string,
  claim: { id: string; title: string },
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options.authority, 'triage complete', verifiedEmail =>
      sendLifecycleEmail(verifiedEmail, {
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
  warning: string,
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );
}

export async function notifyMembershipRenewal(
  userId: string,
  _userEmail: string,
  renewalDate: string,
  options: NotificationChannelOptions
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
      authority: options.authority,
    }
  );

  if (result.success) {
    sendVerifiedEmail(userId, options.authority, 'membership renewal', verifiedEmail =>
      sendLifecycleEmail(verifiedEmail, {
        title: 'Membership renewal reminder',
        intro: `Your Asistenca membership is scheduled to renew on ${renewalDate}.`,
        actionUrl,
        ctaLabel: 'Review membership',
      })
    );
  }

  return result;
}
