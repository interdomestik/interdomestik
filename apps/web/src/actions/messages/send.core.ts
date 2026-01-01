import {
  sendMessageDbCore as sendMessageDbCoreDomain,
  type SendMessageDbCoreResult,
} from '@interdomestik/domain-communications/messages/send';

import { logAuditEvent } from '@/lib/audit';
import { enforceRateLimit } from '@/lib/rate-limit';

import type { Session } from './context';

export type { SendMessageDbCoreResult };

export async function sendMessageDbCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
}): Promise<SendMessageDbCoreResult> {
  const rateLimit = await enforceRateLimit({
    name: 'action:message-send',
    limit: 10,
    windowSeconds: 60, // 10 messages per minute
    headers: params.requestHeaders,
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
