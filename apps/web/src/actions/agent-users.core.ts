'use server';

import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { getAgentUsersCore } from './agent-users/get';

export async function getAgentUsers(filters?: {
  search?: string;
  limit?: number;
  offset?: number;
}): ReturnType<typeof getAgentUsersCore> {
  const authorized = await authorizeSessionTenant();
  if (!authorized) throw new Error('Unauthorized');
  return getAgentUsersCore({ ...authorized, filters });
}
