import { claimMessages, claims, type TenantTransaction } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS } from '@interdomestik/shared-auth';
import { eq } from 'drizzle-orm';
import {
  enqueueClaimMessageNotification,
  enqueueStaffClaimNotification,
  lockClaimNotificationRecipient,
} from '@interdomestik/domain-communications/notification-deliveries';
import { normalizeSelectedMessages } from '@interdomestik/domain-communications/messages/normalize';
import { CLIENT_MESSAGE_ID_PATTERN } from '@interdomestik/domain-communications/messages/schemas';
import {
  hasAgentClaimAccess,
  hasScopedStaffClaimAccess,
  isFullTenantClaimsRole,
  isMemberMessageRole,
  isMessageParticipant,
  storeClaimMessage,
} from '@interdomestik/domain-communications/messages/store';
import { reportServerError } from '@interdomestik/domain-communications/server-error';
import { selectMessagesWithSender } from '@interdomestik/domain-communications/messages/select';
import type { MessageWithSender } from '@interdomestik/domain-communications/messages/types';
import type { AuditLogger, Session } from '@interdomestik/domain-communications/types';
import { resolveStaffClaimNotificationRecipients } from '../staff-claims/notification-recipients';
import { answerClaimResponseRequests, createClaimResponseRequest } from './response-requests';

export type SendMessageDbCoreResult =
  | {
      success: true;
      message: MessageWithSender;
      claim: { id: string; title: string; userId: string; tenantId: string };
      isInternal: boolean;
      isStaff: boolean;
      deliveryIds: string[];
      /** True when a resent client message key returned the already stored message. */
      replayed: boolean;
    }
  | { success: false; error: string };

/**
 * Decides whether the actor may post this message on an in-tenant claim, returning the denial
 * reason or null. Checks run in a fixed order so each role keeps its established error.
 */
async function findMessageSendDenial(args: {
  role: string;
  userId: string;
  branchId: string | null;
  tenantId: string;
  claim: {
    branchId: string | null;
    caseLifecycleState: string | null;
    staffId: string | null;
    userId: string;
  };
  isInternal: boolean;
  tx: TenantTransaction;
}): Promise<string | null> {
  const { role, userId, branchId, claim } = args;
  const isScopedStaff = role === 'staff';
  const isStaff = isScopedStaff || isFullTenantClaimsRole(role);
  const isAgent = role === 'agent';

  if (!isMessageParticipant(role)) return 'Access denied';
  // Full-tenant roles can message any in-tenant claim: no check below denies them.
  if (isScopedStaff && !hasScopedStaffClaimAccess({ branchId, claim, userId })) {
    return 'Access denied';
  }
  if (!isStaff && !isAgent && claim.userId !== userId) return 'Access denied';

  if (isAgent) {
    const canAccess = await hasAgentClaimAccess({
      agentId: userId,
      agentBranchId: branchId,
      claimBranchId: claim.branchId ?? null,
      memberId: claim.userId,
      tenantId: args.tenantId,
      tx: args.tx,
    });
    if (!canAccess) return 'Access denied: You can only message your assigned clients';
  }

  if (args.isInternal && !hasPermission(role, PERMISSIONS['claims.update']))
    return 'Only staff can send internal messages';
  return null;
}

/**
 * Stores the message, inbox rows, deliveries and response-time records in one transaction.
 */
export async function sendMessageDbCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
  clientMessageId?: string;
  deps?: {
    logAuditEvent?: AuditLogger;
  };
}): Promise<SendMessageDbCoreResult> {
  const { session, authority, requestHeaders, claimId, content } = params;
  const isInternal = params.isInternal ?? false;
  const clientMessageId = params.clientMessageId ?? null;

  try {
    if (!session?.user || !authority) {
      return { success: false, error: 'Unauthorized' };
    }

    const actor = session.user;
    const userId = actor.id;
    const userRole = actor.role || 'user';
    const { tenantId } = readTenantAuthority(authority);
    const trimmed = content.trim();
    const isStaff = userRole === 'staff' || isFullTenantClaimsRole(userRole);

    if (!trimmed) {
      return { success: false, error: 'Message cannot be empty' };
    }

    if (trimmed.length > 5000) {
      return { success: false, error: 'Message too long (max 5000 characters)' };
    }

    if (clientMessageId !== null && !CLIENT_MESSAGE_ID_PATTERN.test(clientMessageId)) {
      return { success: false, error: 'Invalid message key' };
    }

    const result = await withTenantAuthority<SendMessageDbCoreResult>(authority, async tx => {
      const [claim] = await tx
        .select({
          branchId: claims.branchId,
          caseLifecycleState: claims.caseLifecycleState,
          category: claims.category,
          claimNumber: claims.claimNumber,
          staffId: claims.staffId,
          title: claims.title,
          userId: claims.userId,
        })
        .from(claims)
        .where(withTenant(tenantId, claims.tenantId, eq(claims.id, claimId)))
        .for('no key update');

      if (!claim) {
        return { success: false, error: 'Claim not found' };
      }

      const denied = await findMessageSendDenial({
        role: userRole,
        userId,
        branchId: actor.branchId ?? null,
        tenantId,
        claim,
        isInternal,
        tx,
      });
      if (denied) {
        return { success: false, error: denied };
      }

      const isPublicStaffReply = !isInternal && isStaff;
      const isPublicMemberMessage =
        !isInternal && claim.userId === userId && isMemberMessageRole(userRole);
      const subject = { tenantId, claimId };
      const staff = isPublicMemberMessage
        ? await resolveStaffClaimNotificationRecipients(tx, { ...subject, staffId: claim.staffId })
        : [];
      const recipient = isPublicStaffReply
        ? await lockClaimNotificationRecipient(tx, tenantId, claim.userId)
        : undefined;

      const stored = await storeClaimMessage(
        tx,
        { tenantId, claimId, senderId: userId, content: trimmed, isInternal },
        clientMessageId
      );
      if (!stored.success) {
        return stored;
      }
      const { messageId, replayed } = stored;
      let deliveryIds: string[] = [];
      if (!replayed && isPublicStaffReply) {
        deliveryIds = await enqueueClaimMessageNotification(tx, {
          ...subject,
          title: claim.title,
          recipient,
          messageId,
        });
        await answerClaimResponseRequests(tx, {
          ...subject,
          kind: 'public_message',
          messageId,
          actorId: userId,
        });
      }
      if (!replayed && isPublicMemberMessage) {
        deliveryIds = await enqueueStaffClaimNotification(
          tx,
          { ...subject, claimNumber: claim.claimNumber, category: claim.category },
          { kind: 'staff_member_message', messageId },
          staff
        );
        await createClaimResponseRequest(tx, {
          ...subject,
          kind: 'member_message',
          messageId,
        });
      }

      const selected = await selectMessagesWithSender(
        tx,
        tenantId,
        eq(claimMessages.id, messageId)
      ).limit(1);

      const createdMessage = normalizeSelectedMessages(selected)[0];
      if (!createdMessage) {
        throw new Error('Created message projection unavailable');
      }

      return {
        success: true,
        message: createdMessage,
        claim: { id: claimId, title: claim.title, userId: claim.userId, tenantId },
        isInternal,
        isStaff,
        deliveryIds,
        replayed,
      };
    });
    if (result.success && !result.replayed && params.deps?.logAuditEvent) {
      try {
        await params.deps.logAuditEvent({
          authority,
          actorId: userId,
          actorRole: actor.role,
          action: 'claim.message_sent',
          entityType: 'claim',
          entityId: claimId,
          metadata: { internal: isInternal, length: trimmed.length },
          headers: requestHeaders,
        });
      } catch (error) {
        console.error('Message audit failed after commit', error);
      }
    }
    return result;
  } catch (error) {
    reportServerError('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
