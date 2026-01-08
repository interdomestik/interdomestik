'use server';

import type { ActionResult } from '@/types/actions';
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

export async function updateUserAgent(
  userId: string,
  agentId: string | null
): Promise<ActionResult<void>> {
  try {
    const { session, requestHeaders } = await getActionContext();

    const validation = updateUserAgentSchema.safeParse({ userId, agentId });
    if (!validation.success) {
      return { success: false, error: 'Validation failed' };
    }

    if (session?.user?.id) {
      const limit = await enforceRateLimitForAction({
        name: `action:admin-users-update-agent:${session.user.id}`,
        limit: 10,
        windowSeconds: 60,
        headers: requestHeaders,
      });

      if (limit.limited) {
        return { success: false, error: 'Too many requests. Please wait a moment.' };
      }
    }

    const result = await updateUserAgentCore({
      session,
      userId: validation.data.userId,
      agentId: validation.data.agentId,
    });

    if ('error' in result) {
      return { success: false, error: result.error };
    }

    return { success: true, data: undefined };
  } catch (err) {
    console.error('[Action:updateUserAgent]', err);
    return { success: false, error: 'Failed to update user agent' };
  }
}

export async function getUsers(
  filters?: GetUsersFilters
): Promise<ActionResult<Awaited<ReturnType<typeof getUsersCore>>>> {
  try {
    const { session } = await getActionContext();
    const validation = getUsersFiltersSchema.safeParse(filters ?? {});
    const safeFilters = validation.success ? validation.data : undefined;
    const data = await getUsersCore({ session, filters: safeFilters });
    return { success: true, data };
  } catch (err) {
    console.error('[Action:getUsers]', err);
    return { success: false, error: 'Failed to retrieve users' };
  }
}

// Fetch available agents for dropdown
export async function getAgents(): Promise<
  ActionResult<Awaited<ReturnType<typeof getAgentsCore>>>
> {
  try {
    const { session } = await getActionContext();
    const data = await getAgentsCore({ session });
    return { success: true, data };
  } catch (err) {
    console.error('[Action:getAgents]', err);
    return { success: false, error: 'Failed to retrieve agents' };
  }
}

export async function getStaff(): Promise<ActionResult<Awaited<ReturnType<typeof getStaffCore>>>> {
  try {
    const { session } = await getActionContext();
    const data = await getStaffCore({ session });
    return { success: true, data };
  } catch (err) {
    console.error('[Action:getStaff]', err);
    return { success: false, error: 'Failed to retrieve staff' };
  }
}
