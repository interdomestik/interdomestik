'use server';

export type { MessageWithSender } from './messages/types';

import { getActionContext } from './messages/context';
import { getMessagesForClaimCore } from './messages/get';
import { markMessagesAsReadCore } from './messages/mark-read';
import { sendMessageCore } from './messages/send';

/**
 * Get messages for a claim.
 * - Members can only see non-internal messages.
 * - Staff/Admins can see all messages including internal notes.
 */
export async function getMessagesForClaim(claimId: string): Promise<{
  success: boolean;
  messages?: import('./messages/types').MessageWithSender[];
  error?: string;
}> {
  const { session, authority } = await getActionContext();
  return getMessagesForClaimCore({ session, authority, claimId });
}

/**
 * Send a message on a claim.
 * - Members can send regular messages.
 * - Staff can send both regular and internal messages.
 * - A resent `clientMessageId` returns the stored message instead of sending it twice.
 */
export async function sendMessage(
  claimId: string,
  content: string,
  isInternal: boolean = false,
  clientMessageId?: string
): Promise<{
  success: boolean;
  message?: import('./messages/types').MessageWithSender;
  error?: string;
}> {
  const { requestHeaders, session, authority } = await getActionContext();
  return sendMessageCore({
    session,
    authority,
    requestHeaders,
    claimId,
    content,
    isInternal,
    clientMessageId,
  });
}

/**
 * Mark messages as read.
 */
export async function markMessagesAsRead(
  messageIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const { session, authority, requestHeaders } = await getActionContext();
  return markMessagesAsReadCore({ session, authority, messageIds, requestHeaders });
}
