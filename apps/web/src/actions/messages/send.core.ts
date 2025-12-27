import { sendMessageDbCore as sendMessageDbCoreDomain } from '@interdomestik/domain-communications/messages/send';

import { logAuditEvent } from '@/lib/audit';
import type { Session } from './context';

export type { SendMessageDbCoreResult } from '@interdomestik/domain-communications/messages/send';

export async function sendMessageDbCore(params: {
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
  claimId: string;
  content: string;
  isInternal?: boolean;
}) {
  return sendMessageDbCoreDomain({
    ...params,
    deps: {
      logAuditEvent,
    },
  });
}
