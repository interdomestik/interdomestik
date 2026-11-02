import { revalidatePath } from 'next/cache';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { updateUserAgentCore as updateUserAgentDomain } from '@interdomestik/domain-users/admin/update-user-agent';
import type { UserSession } from '@interdomestik/domain-users/types';

import { logAuditEvent } from '@/lib/audit';

import type { Session } from './context';

export async function updateUserAgentCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  userId: string;
  agentId: string | null;
}) {
  const result = await updateUserAgentDomain({
    session: params.session as UserSession | null,
    authority: params.authority,
    userId: params.userId,
    agentId: params.agentId,
  });

  if (!('error' in result)) {
    revalidatePath('/admin/users');
    if (params.authority) {
      await logAuditEvent({
        actorId: params.session?.user?.id ?? null,
        actorRole: params.session?.user?.role ?? null,
        authority: params.authority,
        action: 'user.agent_updated',
        entityType: 'user',
        entityId: params.userId,
        metadata: {
          agentId: params.agentId,
        },
      });
    }
  }

  return result;
}
