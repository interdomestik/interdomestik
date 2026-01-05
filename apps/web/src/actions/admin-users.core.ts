'use server';

import { z } from 'zod';

import { enforceRateLimitForAction } from '@/lib/rate-limit';

import { getActionContext } from './admin-users/context';
import { getAgentsCore } from './admin-users/get-agents';
import { getStaffCore } from './admin-users/get-staff';
import type { GetUsersFilters } from './admin-users/get-users';
import { getUsersCore } from './admin-users/get-users';
import { updateUserAgentCore } from './admin-users/update-user-agent';

const updateUserAgentSchema = z
  .object({
    userId: z.string().min(1),
    agentId: z.string().min(1).nullable(),
  })
  .strict();

const getUsersFiltersSchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    role: z.string().trim().min(1).max(50).optional(),
    assignment: z.enum(['assigned', 'unassigned']).optional(),
  })
  .strict();

export async function updateUserAgent(userId: string, agentId: string | null) {
  const { session, requestHeaders } = await getActionContext();

  const validation = updateUserAgentSchema.safeParse({ userId, agentId });
  if (!validation.success) {
    return { error: 'Validation failed' };
  }

  if (session?.user?.id) {
    const limit = await enforceRateLimitForAction({
      name: `action:admin-users-update-agent:${session.user.id}`,
      limit: 10,
      windowSeconds: 60,
      headers: requestHeaders,
    });

    if (limit.limited) {
      return { error: 'Too many requests. Please wait a moment.' };
    }
  }

  return updateUserAgentCore({
    session,
    userId: validation.data.userId,
    agentId: validation.data.agentId,
  });
}

export async function getUsers(filters?: GetUsersFilters) {
  const { session } = await getActionContext();
  const validation = getUsersFiltersSchema.safeParse(filters ?? {});
  const safeFilters = validation.success ? validation.data : undefined;
  return getUsersCore({ session, filters: safeFilters });
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
