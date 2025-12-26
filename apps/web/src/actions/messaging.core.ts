'use server';

/**
 * Legacy compatibility wrapper.
 *
 * Prefer importing from `@/actions/messages` for the canonical messaging Server Actions.
 * This module remains to preserve existing imports and provides a stable adapter surface.
 */

import type { MessageWithSender } from './messages/types';

import { getActionContext } from './messages/context';
import { getMessagesForClaimCore } from './messages/get';
import { sendMessageCore } from './messages/send';

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

function toMessageData(message: MessageWithSender, currentUserId: string): MessageData {
  return {
    id: message.id,
    content: message.content,
    senderId: message.senderId,
    senderName: message.sender.name || 'Unknown',
    senderRole: message.sender.role,
    createdAt: message.createdAt ?? null,
    isInternal: message.isInternal,
    isMe: message.senderId === currentUserId,
  };
}

/**
 * Fetch messages for a claim.
 * Members only see public messages. Staff/Admins see all.
 */
export async function getClaimMessages(claimId: string): Promise<ActionResult<MessageData[]>> {
  const { session } = await getActionContext();
  const result = await getMessagesForClaimCore({ session, claimId });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const currentUserId = session?.user?.id;
  if (!currentUserId) {
    return { success: false, error: 'Unauthorized' };
  }

  return {
    success: true,
    data: (result.messages ?? []).map(message => toMessageData(message, currentUserId)),
  };
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
  const { requestHeaders, session } = await getActionContext();
  const result = await sendMessageCore({ session, requestHeaders, claimId, content, isInternal });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true };
}
