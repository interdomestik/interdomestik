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
  sendNewMessageEmail,
  sendPaymentVerificationEmail,
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

/** Push delivery bound to the caller's audit sink and tenant authority. */
function pushWith(deps: NotificationDeps) {
  return (
    userId: string,
    channel: 'claim_updates' | 'messages',
    payload: Parameters<typeof sendPushToUser>[2]
  ) =>
    (deps.sendPushToUser ?? sendPushToUser)(userId, channel, payload, {
      logAuditEvent: deps.logAuditEvent,
      authority: deps.authority,
    });
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
  const push = pushWith(deps);

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
