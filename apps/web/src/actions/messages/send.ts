import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { revalidatePath } from 'next/cache';
import type { Session } from './context';
import { notifyPublicReplyCore } from './public-reply-notification.core';
import { sendMessageDbCore } from './send.core';
import type { MessageWithSender } from './types';

/**
 * Send a message on a claim.
 * - Members can send regular messages.
 * - Staff can send both regular and internal messages.
 */
export async function sendMessageCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
  clientMessageId?: string;
}): Promise<{ success: boolean; message?: MessageWithSender; error?: string }> {
  const result = await sendMessageDbCore(params);
  if (!result.success) {
    return result;
  }

  for (const path of [
    `/member/claims/${params.claimId}`,
    `/staff/claims/${params.claimId}`,
    '/agent/workspace/claims',
  ]) {
    try {
      revalidatePath(path);
    } catch {
      console.error('Message cache refresh failed after commit');
    }
  }

  if (
    params.session &&
    params.authority &&
    result.claimOwnerEmail &&
    !result.isInternal &&
    result.isStaff &&
    !result.replayed
  ) {
    // Optional: never fails the persisted message response.
    await notifyPublicReplyCore({
      session: params.session,
      authority: params.authority,
      claimId: result.claim.id,
      messageId: result.message.id,
      expectedRecipientId: result.claim.userId,
    });
  }

  return { success: true, message: result.message };
}
