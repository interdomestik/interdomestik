import { sendMessageSchema } from '@interdomestik/domain-communications/messages/schemas';
import {
  sendMessageDbCore as sendMessageDbCoreDomain,
  type SendMessageDbCoreResult,
} from '@interdomestik/domain-communications/messages/send';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';

export type { SendMessageDbCoreResult };

export async function sendMessageDbCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
  clientMessageId?: string;
}): Promise<SendMessageDbCoreResult> {
  const validation = sendMessageSchema.safeParse({
    claimId: params.claimId,
    content: params.content,
    isInternal: params.isInternal,
    clientMessageId: params.clientMessageId,
  });

  if (!validation.success) {
    const formatted = validation.error.format(); // NOSONAR
    const error =
      formatted.content?._errors[0] ||
      formatted.claimId?._errors[0] ||
      formatted.clientMessageId?._errors[0] ||
      'Invalid input';
    return { success: false, error };
  }

  // 10 messages per minute per sender: people behind one shared IP (office NAT, mobile carrier
  // NAT) must not exhaust each other's budget. Without a session the key falls back to the IP.
  const rateLimit = await enforceRateLimit({
    name: 'action:message-send',
    limit: 10,
    windowSeconds: 60,
    headers: params.requestHeaders,
    keySuffix: params.session?.user?.id ?? null,
    keyMode: 'suffix',
    productionSensitive: true,
  });

  if (rateLimit) {
    return { success: false, error: 'Too many requests. Please try again later.' };
  }

  return sendMessageDbCoreDomain({
    ...params,
    deps: {
      logAuditEvent,
    },
  });
}
