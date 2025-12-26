import { logAuditEvent } from '@/lib/audit';
import { claimMessages, claims, db, user } from '@interdomestik/database';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import type { Session } from './context';
import { normalizeSelectedMessages } from './normalize';
import type { MessageWithSender, SelectedMessageRow } from './types';

export type SendMessageDbCoreResult =
  | {
      success: true;
      message: MessageWithSender;
      claim: { id: string; title: string; userId: string };
      isInternal: boolean;
      isStaff: boolean;
      claimOwnerEmail: string | null;
    }
  | { success: false; error: string };

/**
 * Core message send logic (DB + audit).
 * Intentionally excludes Next.js cache revalidation and notifications.
 */
export async function sendMessageDbCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
}): Promise<SendMessageDbCoreResult> {
  const { session, requestHeaders, claimId, content } = params;
  const isInternal = params.isInternal ?? false;

  try {
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;
    const userRole = session.user.role || 'user';
    const trimmed = content.trim();

    if (!trimmed) {
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
      content: trimmed,
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
        length: trimmed.length,
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
    if (!createdMessage) {
      return { success: false, error: 'Failed to send message' };
    }

    let claimOwnerEmail: string | null = null;
    if (!isInternal && isStaff) {
      const claimOwner = await db.query.user.findFirst({
        where: eq(user.id, claim.userId),
      });
      claimOwnerEmail = claimOwner?.email ?? null;
    }

    return {
      success: true,
      message: createdMessage,
      claim: { id: claimId, title: claim.title, userId: claim.userId },
      isInternal,
      isStaff,
      claimOwnerEmail,
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
