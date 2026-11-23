'use server';

import { actionFailure, runAuthenticatedAction, type ActionResult } from '@/lib/safe-action';
import { requireEffectivePortalAccessOrUnauthorized } from '@/server/auth/effective-portal-access';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getUsersCore } from './admin-users/get-users';
import { resolveTenantClassificationCore } from './admin-users/resolve-tenant-classification.core';
import { updateUserAgentCore } from './admin-users/update-user-agent.core';
import { UnauthorizedError } from '@interdomestik/shared-auth/errors';

const getUsersFiltersSchema = z
  .object({
    search: z.string().trim().min(1).max(100).optional(),
    role: z.string().trim().min(1).max(50).optional(),
    assignment: z.enum(['assigned', 'unassigned']).optional(),
  })
  .strict();

export async function updateUserAgent(userId: string, agentId: string | null): ActionResult<void> {
  return runAuthenticatedAction<void>(async ({ session, authority }) => {
    await requireEffectivePortalAccessOrUnauthorized(session, [
      'admin',
      'tenant_admin',
      'super_admin',
    ]);
    const result = await updateUserAgentCore({
      session,
      authority,
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
  const outcome = await runAuthenticatedAction(async ({ session, authority }) => {
    await requireEffectivePortalAccessOrUnauthorized(
      session,
      ['admin', 'tenant_admin', 'super_admin'],
      { requestedTenantId: params.currentTenantId }
    );

    const result = await resolveTenantClassificationCore({
      session,
      authority,
      userId: params.userId,
      currentTenantId: params.currentTenantId,
      nextTenantId: params.nextTenantId ?? null,
    });

    if ('error' in result) {
      // A refusal carries its code end to end; the wrapper classifies by code, never by text.
      if (result.code === 'UNAUTHORIZED') throw new UnauthorizedError(String(result.error));
      if (result.code === 'EMAIL_NOT_PROVEN') {
        const t = await getTranslations('admin.member_profile.tenant_resolution');
        return actionFailure(result.code, t('EMAIL_NOT_PROVEN'));
      }
      throw new Error(String(result.error));
    }
  });
  if (outcome.success) {
    return { success: true };
  }
  return outcome;
}

export async function getUsers(
  filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>
): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return getFilteredUsers(filters, true);
}

export async function getUserChoices(
  filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>
): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return getFilteredUsers(filters, false);
}

async function getFilteredUsers(
  filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>,
  includeUnreadCounts: boolean
): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(
    async ({ session, authority }) => {
      await requireEffectivePortalAccessOrUnauthorized(session, [
        'admin',
        'tenant_admin',
        'super_admin',
      ]);
      const validation = getUsersFiltersSchema.safeParse(filters);
      if (!validation.success) {
        throw new Error('Invalid filters');
      }
      const data = await getUsersCore({
        session,
        authority,
        filters: validation.data,
        includeUnreadCounts,
      });
      return data;
    }
  );
}

export async function getAgents(): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(
    async ({ session, authority }) => {
      await requireEffectivePortalAccessOrUnauthorized(session, [
        'admin',
        'tenant_admin',
        'super_admin',
      ]);
      const data = await getUsersCore({
        session,
        authority,
        filters: { role: 'agent' },
        includeUnreadCounts: false,
      });
      return data;
    }
  );
}

export async function getStaff(): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAuthenticatedAction<Awaited<ReturnType<typeof getUsersCore>>>(
    async ({ session, authority }) => {
      await requireEffectivePortalAccessOrUnauthorized(session, [
        'admin',
        'tenant_admin',
        'super_admin',
      ]);
      const data = await getUsersCore({
        session,
        authority,
        filters: { role: 'staff,tenant_admin,branch_manager' },
      });
      return data;
    }
  );
}
