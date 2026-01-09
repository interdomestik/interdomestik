'use server';

import { runAuthenticatedAction, type ActionResult } from '@/lib/safe-action';
import { z } from 'zod';

import { getUsersCore } from './admin-users/get-users';

const getUsersFiltersSchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    role: z.string().trim().min(1).max(50).optional(),
    assignment: z.enum(['assigned', 'unassigned']).optional(),
  })
  .strict();

import { updateUserAgentCore } from './admin-users/update-user-agent.core';

export async function updateUserAgent(userId: string, agentId: string | null): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session }) => {
    const result = await updateUserAgentCore({
      session,
      userId,
      agentId,
    });

    if ('error' in result) {
      throw new Error(String(result.error));
    }
  });
}

export async function getUsers(
  filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>
): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(async ({ session }) => {
    // Validate filters via Zod
    const validation = getUsersFiltersSchema.safeParse(filters); // Changed from getUsersSchema to getUsersFiltersSchema
    if (!validation.success) {
      throw new Error('Invalid filters');
    }
    const safeFilters = validation.success ? validation.data : undefined;

    // Pass session directly, types are compatible
    const data = await getUsersCore({ session, filters: safeFilters });
    return data;
  });
}

// Fetch available agents for dropdown
export async function getAgents(): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(async ({ session }) => {
    // Agents are just users with role 'agent'
    // We can reuse getUsersCore but filter by role
    const data = await getUsersCore({
      session,
      filters: { role: 'agent' },
    });
    return data;
  });
}

export async function getStaff(): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(async ({ session }) => {
    const data = await getUsersCore({
      session,
      filters: { role: 'staff' },
    });
    return data;
  });
}
