'use server';

import { getActionContext } from './agent-users/context';
import { getAgentUsersCore } from './agent-users/get';

export async function getAgentUsers(filters?: {
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const { session } = await getActionContext();
  return getAgentUsersCore({ session, filters });
}
