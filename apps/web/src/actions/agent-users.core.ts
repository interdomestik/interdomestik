'use server';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { getAgentUsersCore } from './agent-users/get';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';

export async function getAgentUsers(filters?: {
  search?: string;
  limit?: number;
  offset?: number;
}): ReturnType<typeof getAgentUsersCore> {
  const authorized = await authorizeSessionTenant();
  if (!authorized) throw new UnauthorizedError('Unauthorized');
  return getAgentUsersCore({ ...authorized, filters });
}
