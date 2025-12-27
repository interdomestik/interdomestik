import { revalidatePath } from 'next/cache';

import { updateUserAgentCore as updateUserAgentDomain } from '@interdomestik/domain-users/admin/update-user-agent';
import type { UserSession } from '@interdomestik/domain-users/types';

import type { Session } from './context';

export async function updateUserAgentCore(params: {
  session: NonNullable<Session> | null;
  userId: string;
  agentId: string | null;
}) {
  const result = await updateUserAgentDomain({
    session: params.session as UserSession | null,
    userId: params.userId,
    agentId: params.agentId,
  });

  if (!('error' in result)) {
    revalidatePath('/admin/users');
  }

  return result;
}
