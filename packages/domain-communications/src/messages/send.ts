import { claimMessages, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { eq } from 'drizzle-orm';
import type { AuditLogger, Session } from '../types';
import { hasAgentClaimAccess, hasScopedStaffClaimAccess, isFullTenantClaimsRole } from './access';
import { normalizeSelectedMessages } from './normalize';
import { CLIENT_MESSAGE_ID_PATTERN } from './schemas';
import { storeClaimMessage } from './store-message';
import type { MessageWithSender, SelectedMessageRow } from './types';

export {
  preparePublicReplyNotification,
  loadPublicReplyPushSubscriptions,
  removeExpiredPublicReplySubscriptions,
  type PreparePublicReplyNotificationResult,
  type PublicReplyNotificationPlan,
} from './public-reply-notification';
export {
  deliverPublicReplyNotification,
  describePublicReplyFailure,
  type PublicReplyDeliveryDeps,
} from './public-reply-delivery';

export type SendMessageDbCoreResult =
  | {
      success: true;
      message: MessageWithSender;
      claim: { id: string; title: string; userId: string; tenantId: string };
      isInternal: boolean;
      isStaff: boolean;
      claimOwnerEmail: string | null;
      /** True when a resent client message key returned the already stored message. */
      replayed: boolean;
    }
  | { success: false; error: string };

/**
 * Core message send logic (DB + audit).
 * Intentionally excludes Next.js cache revalidation and notifications.
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
    const isScopedStaff = userRole === 'staff';
    const isBranchManager = userRole === 'branch_manager';
    const isPrivilegedStaff = isFullTenantClaimsRole(userRole);
    const isStaff = isScopedStaff || isPrivilegedStaff;
    const isAgent = userRole === 'agent';

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
      const claim = await tx.query.claims.findFirst({
        where: (claimsTable, { eq }) =>
          withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
      });

      if (!claim) {
        return { success: false, error: 'Claim not found' };
      }

      if (isBranchManager) {
        return { success: false, error: 'Access denied' };
      }

      if (isPrivilegedStaff) {
        // Full-tenant roles can message any in-tenant claim.
      } else if (
        isScopedStaff &&
        !hasScopedStaffClaimAccess({
          branchId: actor.branchId ?? null,
          claim,
          userId,
        })
      ) {
        return { success: false, error: 'Access denied' };
      } else if (!isStaff && !isAgent && claim.userId !== userId) {
        return { success: false, error: 'Access denied' };
      }

      if (isAgent) {
        const canAccess = await hasAgentClaimAccess({
          agentId: userId,
          agentBranchId: actor.branchId ?? null,
          claimBranchId: claim.branchId ?? null,
          memberId: claim.userId,
          tenantId,
          tx,
        });

        if (!canAccess) {
          return {
            success: false,
            error: 'Access denied: You can only message your assigned clients',
          };
        }
      }

      if (isInternal && !isStaff) {
        return { success: false, error: 'Only staff can send internal messages' };
      }

      const stored = await storeClaimMessage(
        tx,
        { tenantId, claimId, senderId: userId, content: trimmed, isInternal },
        clientMessageId
      );
      if (!stored.success) {
        return stored;
      }
      const { messageId, replayed } = stored;

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

      let claimOwnerEmail: string | null = null;
      if (!isInternal && isStaff) {
        const claimOwner = await tx.query.user.findFirst({
          where: (users, { eq }) =>
            withTenant(tenantId, users.tenantId, eq(users.id, claim.userId)),
        });
        claimOwnerEmail = claimOwner?.email ?? null;
      }

      return {
        success: true,
        message: createdMessage,
        claim: { id: claimId, title: claim.title, userId: claim.userId, tenantId },
        isInternal,
        isStaff,
        claimOwnerEmail,
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
      } catch {
        console.error('Message audit failed after commit');
      }
    }
    return result;
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
