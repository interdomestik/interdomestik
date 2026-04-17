import { claimMessages, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { Session } from '../types';
import { buildAccessibleClaimIdsSubquery, isFullTenantClaimsRole } from './access';

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

    const tenantId = ensureTenantId(session);
    const userRole = session.user.role || 'user';
    const isPrivilegedStaff = isFullTenantClaimsRole(userRole);

    // Base condition: Message must be in tenant, have the ID, and be unread.
    const baseCondition = and(
      eq(claimMessages.tenantId, tenantId),
      inArray(claimMessages.id, messageIds),
      isNull(claimMessages.readAt)
    );

    const accessCondition = isPrivilegedStaff
      ? undefined
      : inArray(
          claimMessages.claimId,
          buildAccessibleClaimIdsSubquery({
            branchId: session.user.branchId ?? null,
            role: userRole,
            tenantId,
            userId: session.user.id,
          })
        );

    await db
      .update(claimMessages)
      .set({ readAt: new Date() })
      .where(and(baseCondition, accessCondition));

    return { success: true };
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}
