import { kickClaimNotificationDeliveries } from '@/lib/claim-notification-delivery-kick';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
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

  if (params.authority && result.deliveryIds.length > 0) {
    try {
      await kickClaimNotificationDeliveries(params.authority, result.deliveryIds);
    } catch (error) {
      console.error('Message notification dispatch failed after commit', error);
    }
  }

  for (const path of [
    `/member/claims/${params.claimId}`,
    `/staff/claims/${params.claimId}`,
    '/agent/workspace/claims',
  ]) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error('Message cache refresh failed after commit', error);
    }
  }

  return { success: true, message: result.message };
}
