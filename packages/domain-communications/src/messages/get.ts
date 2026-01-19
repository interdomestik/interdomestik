import { claimMessages, db, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';
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
      where: (claimsTable, { eq }) =>
        withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, claimId)),
    });

    if (!claim) {
      return { success: false, error: 'Claim not found' };
    }

    const isStaff = userRole === 'staff' || userRole === 'admin';
    const isAgent = userRole === 'agent';

    if (!isStaff && !isAgent && claim.userId !== userId) {
      return { success: false, error: 'Access denied' };
    }

    if (isAgent) {
      const linkedClient = await db.query.agentClients.findFirst({
        where: (table, { and, eq }) =>
          and(
            eq(table.tenantId, tenantId),
            eq(table.agentId, userId),
            eq(table.memberId, claim.userId),
            eq(table.status, 'active')
          ),
      });

      if (!linkedClient) {
        return { success: false, error: 'Access denied' };
      }
    }

    const visibilityCondition = isStaff
      ? undefined
      : or(eq(claimMessages.isInternal, false), eq(claimMessages.senderId, userId));
    const messageCondition = visibilityCondition
      ? and(eq(claimMessages.claimId, claimId), visibilityCondition)
      : eq(claimMessages.claimId, claimId);

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
      .where(withTenant(tenantId, claimMessages.tenantId, messageCondition))
      .orderBy(claimMessages.createdAt)) as unknown as SelectedMessageRow[];

    return { success: true, messages: normalizeSelectedMessages(selected) };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { success: false, error: 'Failed to fetch messages' };
  }
}
