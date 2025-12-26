import { logAuditEvent } from '@/lib/audit';
import { notifyNewMessage } from '@/lib/notifications';
import { claimMessages, claims, db, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import type { Session } from './context';
import { normalizeSelectedMessages } from './normalize';
import type { MessageWithSender, SelectedMessageRow } from './types';

/**
 * Send a message on a claim.
 * - Members can send regular messages.
 * - Staff can send both regular and internal messages.
 */
export async function sendMessageCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
}): Promise<{ success: boolean; message?: MessageWithSender; error?: string }> {
  const { session, requestHeaders, claimId, content } = params;
  const isInternal = params.isInternal ?? false;

  try {
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;
    const userRole = session.user.role || 'user';

    if (!content.trim()) {
      return { success: false, error: 'Message cannot be empty' };
    }

    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
    });

    if (!claim) {
      return { success: false, error: 'Claim not found' };
    }

    const isStaff = userRole === 'staff' || userRole === 'admin';

    if (!isStaff && claim.userId !== userId) {
      return { success: false, error: 'Access denied' };
    }

    if (isInternal && !isStaff) {
      return { success: false, error: 'Only staff can send internal messages' };
    }

    const messageId = nanoid();

    await db.insert(claimMessages).values({
      id: messageId,
      claimId,
      senderId: userId,
      content: content.trim(),
      isInternal,
    });

    await logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role,
      action: 'claim.message_sent',
      entityType: 'claim',
      entityId: claimId,
      metadata: {
        internal: isInternal,
        length: content.trim().length,
      },
      headers: requestHeaders,
    });

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
      .where(eq(claimMessages.id, messageId))
      .limit(1)) as unknown as SelectedMessageRow[];

    const createdMessage = normalizeSelectedMessages(selected)[0];

    revalidatePath(`/member/claims/${claimId}`);
    revalidatePath(`/staff/claims/${claimId}`);

    if (!isInternal && isStaff) {
      const claimOwner = await db.query.user.findFirst({
        where: eq(user.id, claim.userId),
      });

      if (claimOwner?.email) {
        notifyNewMessage(
          claim.userId,
          claimOwner.email,
          { id: claimId, title: claim.title },
          session.user.name || 'Agent',
          content
        ).catch((err: Error) => console.error('Failed to send message notification:', err));
      }
    }

    return { success: true, message: createdMessage };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
