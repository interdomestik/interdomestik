import { claimMessages, claims, user, type TenantTransaction } from '@interdomestik/database';
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
  lockClaimNotificationRecipient,
} from '../notification-deliveries/claim-owner';
import {
  enqueueStaffClaimNotification,
  resolveStaffClaimNotificationRecipients,
} from '../notification-deliveries/staff';
import type { DeliveryDependencies } from '../notification-deliveries/types';
import type { AuditLogger, Session } from '../types';
import {
  hasAgentClaimAccess,
  hasScopedStaffClaimAccess,
  isFullTenantClaimsRole,
  isMemberMessageRole,
  isMessageParticipant,
} from './access';
import { normalizeSelectedMessages } from './normalize';
import { CLIENT_MESSAGE_ID_PATTERN } from './schemas';
import { describePublicReplyFailure } from './send-error';
import { storeClaimMessage } from './store-message';
import type { MessageWithSender, SelectedMessageRow } from './types';

export { describePublicReplyFailure } from './send-error';

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

export type ClaimMessageEffects = {
  buildStaffClaimScope: DeliveryDependencies['buildStaffClaimScope'];
  createClaimResponseRequest: (
    tx: TenantTransaction,
    request: { tenantId: string; claimId: string; kind: 'member_message'; messageId: string }
  ) => Promise<void>;
  answerClaimResponseRequests: (
    tx: TenantTransaction,
    answer: {
      tenantId: string;
      claimId: string;
      kind: 'public_message';
      messageId: string;
      actorId: string;
    }
  ) => Promise<void>;
};

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
  claimEffects: ClaimMessageEffects;
  deps?: {
    logAuditEvent?: AuditLogger;
  };
}): Promise<SendMessageDbCoreResult> {
  const { session, authority, requestHeaders, claimId, content, claimEffects } = params;
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
        ? await resolveStaffClaimNotificationRecipients(
            tx,
            { ...subject, staffId: claim.staffId },
            claimEffects.buildStaffClaimScope
          )
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
        await claimEffects.answerClaimResponseRequests(tx, {
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
        await claimEffects.createClaimResponseRequest(tx, {
          ...subject,
          kind: 'member_message',
          messageId,
        });
      }

      const selected = (await tx
        .select({
          id: claimMessages.id,
          claimId: claimMessages.claimId,
          senderId: claimMessages.senderId,
          content: claimMessages.content,
          isInternal: claimMessages.isInternal,
          readAt: claimMessages.readAt,
          createdAt: claimMessages.createdAt,
          sender: {
            id: user.id,
            name: user.name,
            image: user.image,
            role: user.role,
          },
        })
        .from(claimMessages)
        .leftJoin(user, eq(claimMessages.senderId, user.id))
        .where(withTenant(tenantId, claimMessages.tenantId, eq(claimMessages.id, messageId)))
        .limit(1)) as unknown as SelectedMessageRow[];

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
    console.error(
      'Error sending message:',
      new Error('Message transaction failed', {
        cause: describePublicReplyFailure(error),
      })
    );
    return { success: false, error: 'Failed to send message' };
  }
}
