import { claimMessages, claims, db } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import type { Session } from '../types';

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
    const isStaff = userRole === 'staff' || userRole === 'admin';

    // Base condition: Message must be in tenant, have the ID, and be unread.
    const baseCondition = and(
      eq(claimMessages.tenantId, tenantId),
      inArray(claimMessages.id, messageIds),
      isNull(claimMessages.readAt)
    );

    // Access condition:
    // - Staff: No extra restriction (can read all messages in tenant).
    // - Member: Message must belong to a claim owned by the user.
    //   AND (implicitly) usually shouldn't mark own messages as read?
    //   But "read status" is just a flag. If I mark my own message read, it's weird but not a security breach like IDOR.
    //   Preventing marking *others'* messages in *other* claims is the key.
    //   So restricting to claims owned by users is sufficient to prevent IDOR on other users' data.
    const accessCondition = isStaff
      ? undefined
      : inArray(
          claimMessages.claimId,
          db
            .select({ id: claims.id })
            .from(claims)
            .where(and(eq(claims.tenantId, tenantId), eq(claims.userId, session.user.id)))
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
