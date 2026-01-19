import { notifyNewMessage } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';
import type { Session } from './context';
import { sendMessageDbCore } from './send.core';
import type { MessageWithSender } from './types';

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
  const result = await sendMessageDbCore(params);
  if (!result.success) {
    return result;
  }

  revalidatePath(`/member/claims/${params.claimId}`);
  revalidatePath(`/staff/claims/${params.claimId}`);
  revalidatePath('/agent/workspace/claims');

  if (result.claimOwnerEmail && !result.isInternal && result.isStaff) {
    notifyNewMessage(
      result.claim.userId,
      result.claimOwnerEmail,
      { id: result.claim.id, title: result.claim.title },
      params.session?.user?.name || 'Agent',
      params.content
    ).catch((err: Error) => console.error('Failed to send message notification:', err));
  }

  return { success: true, message: result.message };
}
