import { sendPushToUser as sendPushToUserDomain } from '@interdomestik/domain-communications/push';
import type { PushPayload } from '@interdomestik/domain-communications/push';

import { logAuditEvent } from '@/lib/audit';

export async function sendPushToUser(
  userId: string,
  channel: 'claim_updates' | 'messages',
  payload: PushPayload,
  deps: { tenantId: string }
) {
  return sendPushToUserDomain(userId, channel, payload, { logAuditEvent, tenantId: deps.tenantId });
}

export type { PushPayload } from '@interdomestik/domain-communications/push';
