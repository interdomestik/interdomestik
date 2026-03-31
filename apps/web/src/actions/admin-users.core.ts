'use server';

import { runAuthenticatedAction, type ActionResult } from '@/lib/safe-action';
import { requireEffectivePortalAccessOrUnauthorized } from '@/server/auth/effective-portal-access';
import { z } from 'zod';

import { getUsersCore } from './admin-users/get-users';
import { resolveTenantClassificationCore } from './admin-users/resolve-tenant-classification.core';
import { updateUserAgentCore } from './admin-users/update-user-agent.core';

const getUsersFiltersSchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    role: z.string().trim().min(1).max(50).optional(),
    assignment: z.enum(['assigned', 'unassigned']).optional(),
  })
  .strict();

export async function updateUserAgent(userId: string, agentId: string | null): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session }) => {
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
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

export async function resolveTenantClassification(params: {
  userId: string;
  currentTenantId: string;
  nextTenantId?: string | null;
}): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session }) => {
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: params.currentTenantId }
    );

    const result = await resolveTenantClassificationCore({
      session,
      userId: params.userId,
      currentTenantId: params.currentTenantId,
      nextTenantId: params.nextTenantId ?? null,
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
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    const validation = getUsersFiltersSchema.safeParse(filters);
    if (!validation.success) {
      throw new Error('Invalid filters');
    }
    const data = await getUsersCore({ session, filters: validation.data });
    return data;
  });
}

export async function getAgents(): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(async ({ session }) => {
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    const data = await getUsersCore({
      session,
      filters: { role: 'agent' },
    });
    return data;
  });
}

export async function getStaff(): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(async ({ session }) => {
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    const data = await getUsersCore({
      session,
      filters: { role: 'staff,tenant_admin,branch_manager' },
    });
    return data;
  });
}
