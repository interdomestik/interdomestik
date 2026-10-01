import { claimMessages, withTenantContext } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';

import type { Session } from '../types';
import {
  buildAccessibleClaimIdsSubquery,
  isFullTenantClaimsRole,
  isScopedClaimsReadRole,
} from './access';

/**
 * Mark messages as read.
 * Scoped by Tenant and User access (via Claim ownership or Staff role).
 */
export async function markMessagesAsReadCore(params: {
  session: NonNullable<Session> | null;
  messageIds: string[];
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { session, messageIds } = params;

    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    if (messageIds.length === 0) {
      return { success: true };
    }

    const actor = session.user;
    const tenantId = ensureTenantId(session);
    const userRole = actor.role || 'user';
    const isPrivilegedStaff = isFullTenantClaimsRole(userRole);
    const isStaff = isPrivilegedStaff || isScopedClaimsReadRole(userRole);

    return await withTenantContext({ tenantId, role: userRole }, async tx => {
      // A read receipt must be created by a recipient for a message visible to their role.
      const baseCondition = and(
        eq(claimMessages.tenantId, tenantId),
        inArray(claimMessages.id, messageIds),
        isNull(claimMessages.readAt),
        ne(claimMessages.senderId, actor.id),
        isStaff ? undefined : eq(claimMessages.isInternal, false)
      );

      const accessCondition = isPrivilegedStaff
        ? undefined
        : inArray(
            claimMessages.claimId,
            buildAccessibleClaimIdsSubquery({
              branchId: actor.branchId ?? null,
              role: userRole,
              tenantId,
              tx,
              userId: actor.id,
            })
          );

      // db-access-guard: tenant-scoped -- reason: tenantId resolved into local variable before this DB call
      await tx
        .update(claimMessages)
        .set({ readAt: new Date() })
        .where(and(baseCondition, accessCondition));

      return { success: true };
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}
