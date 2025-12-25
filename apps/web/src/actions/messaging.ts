'use server';

import { auth } from '@/lib/auth';
import { claimMessages, claims, db } from '@interdomestik/database';
import { and, asc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export interface MessageData {
  id: string;
  content: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  createdAt: Date | null;
  isInternal: boolean;
  isMe: boolean;
}

export type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};

/**
 * Fetch messages for a claim.
 * Members only see public messages. Staff/Admins see all.
 */
export async function getClaimMessages(claimId: string): Promise<ActionResult<MessageData[]>> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // 1. Check access rights
    const claim = await db.query.claims.findFirst({
      where: eq(claims.id, claimId),
      columns: { userId: true, agentId: true, staffId: true },
    });

    if (!claim) return { success: false, error: 'Claim not found' };

    const isMember = session.user.role === 'user';
    const isStaffOrAdmin = ['staff', 'admin'].includes(session.user.role);

    // Access control:
    // - Member: can view if they own the claim
    // - Agent: can view if they are valid agent (usually restricted view, but for msgs maybe ok?)
    // - Staff/Admin: can view all
    if (isMember && claim.userId !== session.user.id) {
      return { success: false, error: 'Unauthorized' };
    }
    // Agents generally don't see full message history in this model, but if they do, strictly public.

    // 2. Build query
    const whereConditions = [eq(claimMessages.claimId, claimId)];

    // If not staff/admin, filter out internal messages
    if (!isStaffOrAdmin) {
      whereConditions.push(eq(claimMessages.isInternal, false));
    }

    const messages = await db.query.claimMessages.findMany({
      where: and(...whereConditions),
      orderBy: asc(claimMessages.createdAt),
      with: {
        sender: {
          columns: { name: true, role: true, image: true },
        },
      },
    });

    // 3. Transform for UI
    const formattedMessages: MessageData[] = messages.map(msg => ({
      id: msg.id,
      content: msg.content,
      senderId: msg.senderId,
      senderName: msg.sender.name || 'Unknown',
      senderRole: msg.sender.role,
      createdAt: msg.createdAt,
      isInternal: msg.isInternal ?? false,
      isMe: msg.senderId === session.user.id,
    }));

    return { success: true, data: formattedMessages };
  } catch (error) {
    console.error('Error fetching messages:', error);
    return { success: false, error: 'Failed to fetch messages' };
  }
}

/**
 * Send a new message.
 * Staff can set `isInternal`. Members cannot.
 */
export async function sendMessage(
  claimId: string,
  content: string,
  isInternal: boolean = false
): Promise<ActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const isStaffOrAdmin = ['staff', 'admin'].includes(session.user.role);

    // Force isInternal to false if not staff/admin
    const finalIsInternal = isStaffOrAdmin ? isInternal : false;

    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      claimId,
      senderId: session.user.id,
      content,
      isInternal: finalIsInternal,
      createdAt: new Date(),
    });

    revalidatePath(`/member/claims/${claimId}`);
    revalidatePath(`/staff/claims/${claimId}`);

    return { success: true };
  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: 'Failed to send message' };
  }
}
