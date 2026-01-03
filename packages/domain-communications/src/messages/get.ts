import { claimMessages, db, user } from '@interdomestik/database';
import { ensureTenantId } from '@interdomestik/domain-users';
import { and, eq, or } from 'drizzle-orm';
import type { Session } from '../types';
import { normalizeSelectedMessages } from './normalize';
import type { MessageWithSender, SelectedMessageRow } from './types';

/**
 * Get messages for a claim.
 * - Members can only see non-internal messages.
 * - Staff/Admins can see all messages including internal notes.
 */
export async function getMessagesForClaimCore(params: {
  session: NonNullable<Session> | null;
  claimId: string;
}): Promise<{ success: boolean; messages?: MessageWithSender[]; error?: string }> {
  const { session, claimId } = params;

  try {
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;
    const userRole = session.user.role || 'user';
    const tenantId = ensureTenantId(session);

    const claim = await db.query.claims.findFirst({
      where: (claimsTable, { and, eq }) =>
        and(eq(claimsTable.id, claimId), eq(claimsTable.tenantId, tenantId)),
    });

    if (!claim) {
      return { success: false, error: 'Claim not found' };
    }

    const isStaff = userRole === 'staff' || userRole === 'admin';
    if (!isStaff && claim.userId !== userId) {
      return { success: false, error: 'Access denied' };
    }

    const selected = (await db
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
      .where(
        and(
          eq(claimMessages.claimId, claimId),
          eq(claimMessages.tenantId, tenantId),
          isStaff
            ? undefined
            : or(eq(claimMessages.isInternal, false), eq(claimMessages.senderId, userId))
        )
      )
      .orderBy(claimMessages.createdAt)) as unknown as SelectedMessageRow[];

    return { success: true, messages: normalizeSelectedMessages(selected) };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { success: false, error: 'Failed to fetch messages' };
  }
}
