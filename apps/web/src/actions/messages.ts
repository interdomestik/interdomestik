'use server';

import { auth } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { notifyNewMessage } from '@/lib/notifications';
import { claimMessages, claims, db, user } from '@interdomestik/database';
import { and, eq, isNull, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export type MessageWithSender = {
  id: string;
  claimId: string;
  senderId: string;
  content: string;
  isInternal: boolean;
  readAt: Date | null;
  createdAt: Date;
  sender: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
};

/**
 * Get messages for a claim.
 * - Members can only see non-internal messages.
 * - Agents/Admins can see all messages including internal notes.
 */
export async function getMessagesForClaim(claimId: string): Promise<{
  success: boolean;
  messages?: MessageWithSender[];
  error?: string;
}> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;
    const userRole = session.user.role || 'member';

    // Verify user has access to this claim
    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
    });

    if (!claim) {
      return { success: false, error: 'Claim not found' };
    }

    // Members can only access their own claims
    const isAgent = userRole === 'agent' || userRole === 'admin' || userRole === 'supervisor';
    if (!isAgent && claim.userId !== userId) {
      return { success: false, error: 'Access denied' };
    }

    // Build query: members see only public messages, agents see all
    const messages = await db
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
          // If not an agent, filter out internal messages
          isAgent
            ? undefined
            : or(eq(claimMessages.isInternal, false), eq(claimMessages.senderId, userId))
        )
      )
      .orderBy(claimMessages.createdAt);

    return {
      success: true,
      messages: messages.map(m => ({
        id: m.id,
        claimId: m.claimId,
        senderId: m.senderId,
        content: m.content,
        isInternal: m.isInternal ?? false,
        readAt: m.readAt,
        createdAt: m.createdAt ?? new Date(),
        sender: {
          id: m.sender?.id ?? m.senderId,
          name: m.sender?.name ?? 'Unknown',
          image: m.sender?.image ?? null,
          role: m.sender?.role ?? 'member',
        },
      })),
    };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { success: false, error: 'Failed to fetch messages' };
  }
}

/**
 * Send a message on a claim.
 * - Members can send regular messages.
 * - Agents can send both regular and internal messages.
 */
export async function sendMessage(
  claimId: string,
  content: string,
  isInternal: boolean = false
): Promise<{ success: boolean; message?: MessageWithSender; error?: string }> {
  try {
    const requestHeaders = await headers();
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    const userId = session.user.id;
    const userRole = session.user.role || 'member';

    if (!content.trim()) {
      return { success: false, error: 'Message cannot be empty' };
    }

    // Verify user has access to this claim
    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
    });

    if (!claim) {
      return { success: false, error: 'Claim not found' };
    }

    const isAgent = userRole === 'agent' || userRole === 'admin' || userRole === 'supervisor';

    // Members can only send on their own claims
    if (!isAgent && claim.userId !== userId) {
      return { success: false, error: 'Access denied' };
    }

    // Only agents can send internal messages
    if (isInternal && !isAgent) {
      return { success: false, error: 'Only agents can send internal messages' };
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

    // Fetch the created message with sender info
    const result = await db
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
      .limit(1);

    const createdMessage = result[0];

    // Revalidate the claim pages to show updated message count
    revalidatePath(`/dashboard/claims/${claimId}`);
    revalidatePath(`/agent/claims/${claimId}`);

    // Send notification (fire and forget)
    if (!isInternal && isAgent) {
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

    return {
      success: true,
      message: {
        id: createdMessage.id,
        claimId: createdMessage.claimId,
        senderId: createdMessage.senderId,
        content: createdMessage.content,
        isInternal: createdMessage.isInternal ?? false,
        readAt: createdMessage.readAt,
        createdAt: createdMessage.createdAt ?? new Date(),
        sender: {
          id: createdMessage.sender?.id ?? createdMessage.senderId,
          name: createdMessage.sender?.name ?? 'Unknown',
          image: createdMessage.sender?.image ?? null,
          role: createdMessage.sender?.role ?? 'member',
        },
      },
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

/**
 * Mark messages as read.
 */
export async function markMessagesAsRead(
  messageIds: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return { success: false, error: 'Unauthorized' };
    }

    if (messageIds.length === 0) {
      return { success: true };
    }

    // Mark messages as read
    for (const messageId of messageIds) {
      await db
        .update(claimMessages)
        .set({ readAt: new Date() })
        .where(and(eq(claimMessages.id, messageId), isNull(claimMessages.readAt)));
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking messages as read:', error);
    return { success: false, error: 'Failed to mark messages as read' };
  }
}
