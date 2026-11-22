import { claimMessages, claims, user, type TenantTransaction } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
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
import { sendMessageSchema } from '@interdomestik/domain-communications/messages/schemas';
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
import { z } from 'zod';
import { resolveStaffClaimNotificationRecipients } from '../staff-claims/notification-recipients';
import { answerClaimResponseRequests, createClaimResponseRequest } from './response-requests';
import { resolveBoundClaimPrincipal } from './status-actor';

const sendMessageCommandSchema = sendMessageSchema
  .extend({
    content: z
      .string()
      .trim()
      .min(1, { message: 'Message cannot be empty' })
      .max(5000, { message: 'Message too long (max 5000 characters)' }),
  })
  .strict();

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

  if (args.isInternal) {
    if (!hasPermission(role, PERMISSIONS['claims.update'])) {
      return 'Only staff can send internal messages';
    }
    if (isFullTenantClaimsRole(role)) {
      const [localActor] = await args.tx
        .select({ id: user.id })
        .from(user)
        .where(withTenant(args.tenantId, user.tenantId, eq(user.id, userId)))
        .for('share');
      if (!localActor) return 'Access denied';
    }
  }
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
  const { session, authority, requestHeaders, deps, ...input } = params;
  const actor = resolveBoundClaimPrincipal(authority, session);
  if (!authority || !actor) return { success: false, error: 'Unauthorized' };
  const { principal, tenantId } = actor;
  const { userId, branchId } = principal;
  const userRole = principal.role || 'user';
  const parsed = sendMessageCommandSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      success: false,
      error:
        issue?.code === 'unrecognized_keys' ? 'Invalid input' : (issue?.message ?? 'Invalid input'),
    };
  }
  const { claimId, content: trimmed, isInternal = false, clientMessageId = null } = parsed.data;
  const isStaff = userRole === 'staff' || isFullTenantClaimsRole(userRole);

  try {
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
        branchId,
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
    if (result.success && !result.replayed && deps?.logAuditEvent) {
      try {
        await deps.logAuditEvent({
          authority,
          actorId: userId,
          actorRole: principal.role,
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
