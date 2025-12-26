'use server';

import { getActionContext } from './admin-users/context';
import { getAgentsCore } from './admin-users/get-agents';
import { getStaffCore } from './admin-users/get-staff';
import type { GetUsersFilters } from './admin-users/get-users';
import { getUsersCore } from './admin-users/get-users';
import { updateUserAgentCore } from './admin-users/update-user-agent';

export async function updateUserAgent(userId: string, agentId: string | null) {
  const { session } = await getActionContext();
  return updateUserAgentCore({ session, userId, agentId });
}

export async function getUsers(filters?: GetUsersFilters) {
  const { session } = await getActionContext();
  return getUsersCore({ session, filters });
}

// Fetch available agents for dropdown
export async function getAgents() {
  const { session } = await getActionContext();
  return getAgentsCore({ session });
}

export async function getStaff() {
  const { session } = await getActionContext();
  return getStaffCore({ session });
}
