import { claimMessages, user } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { hasPermission, PERMISSIONS } from '@interdomestik/shared-auth';
import { and, eq } from 'drizzle-orm';
import type { Session } from '../types';
import {
  hasAgentClaimAccess,
  hasScopedClaimsReadAccess,
  isMemberMessageRole,
  isFullTenantClaimsRole,
  isScopedClaimsReadRole,
} from './access';
import { normalizeSelectedMessages } from './normalize';
import { canAcknowledgeClaim } from './acknowledgement';
import type { MessageWithSender, SelectedMessageRow } from './types';

/**
 * Get messages for a claim.
 * - Members can only see non-internal messages.
 * - Staff, tenant admins, and super admins can see all messages including internal notes.
 */
export async function getMessagesForClaimCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  claimId: string;
}): Promise<{
  success: boolean;
  messages?: MessageWithSender[];
  canAcknowledge?: boolean;
  error?: string;
}> {
  const { session, authority, claimId } = params;

  try {
    if (!session?.user || !authority) {
      return { success: false, error: 'Unauthorized' };
    }

    const actor = session.user;
    const userId = actor.id;
    const userRole = actor.role || 'user';
    const { tenantId } = readTenantAuthority(authority);
    const isScopedStaff = isScopedClaimsReadRole(userRole);
    const isPrivilegedStaff = isFullTenantClaimsRole(userRole);
    const isStaff = isScopedStaff || isPrivilegedStaff;
    const isAgent = userRole === 'agent';

    return await withTenantAuthority(authority, async tx => {
      const claim = await tx.query.claims.findFirst({
        where: (claimsTable, { eq }) =>
          withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
      });

      if (!claim) {
        return { success: false, error: 'Claim not found' };
      }

      if (!hasPermission(userRole, PERMISSIONS['claims.read']) && !isMemberMessageRole(userRole)) {
        return { success: false, error: 'Access denied' };
      }

      if (isPrivilegedStaff) {
        // Full-tenant roles can read any in-tenant claim messages.
      } else if (
        isScopedStaff &&
        !hasScopedClaimsReadAccess({
          branchId: actor.branchId ?? null,
          claim,
          role: userRole,
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
          return { success: false, error: 'Access denied' };
        }
      }

      const canAcknowledge = await canAcknowledgeClaim({
        tx,
        tenantId,
        role: userRole,
        userId,
        branchId: actor.branchId,
        claimId,
      });
      const visibilityCondition = isStaff ? undefined : eq(claimMessages.isInternal, false);
      const messageCondition = visibilityCondition
        ? and(eq(claimMessages.claimId, claimId), visibilityCondition)
        : eq(claimMessages.claimId, claimId);

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
        .where(withTenant(tenantId, claimMessages.tenantId, messageCondition))
        .orderBy(claimMessages.createdAt)) as unknown as SelectedMessageRow[];

      return { success: true, messages: normalizeSelectedMessages(selected), canAcknowledge };
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { success: false, error: 'Failed to fetch messages' };
  }
}
