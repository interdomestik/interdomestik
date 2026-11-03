import { sendPushToUser as sendPushToUserDomain } from '@interdomestik/domain-communications/push';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { PushPayload } from '@interdomestik/domain-communications/push';

import { logAuditEvent } from '@/lib/audit';

export async function sendPushToUser(
  userId: string,
  channel: 'claim_updates' | 'messages',
  payload: PushPayload,
  deps: { authority: TenantAuthority }
) {
  return sendPushToUserDomain(userId, channel, payload, {
    logAuditEvent,
    authority: deps.authority,
  });
}

export type { PushPayload } from '@interdomestik/domain-communications/push';
