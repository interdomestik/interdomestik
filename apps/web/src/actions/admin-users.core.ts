'use server';

import { memberGuarded, runAdmittedAction } from '@/lib/privacy/require-member-acceptance';
import type { AuthorizedSession } from '@/lib/tenant-authority.server';
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

const guardedGetUsers = memberGuarded(
  async (
    authorized,
    filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>
  ): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> => {
    return getFilteredUsers(authorized, filters, true);
  }
);

const guardedGetUserChoices = memberGuarded(
  async (
    authorized,
    filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>
  ): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> => {
    return getFilteredUsers(authorized, filters, false);
  }
);

async function getFilteredUsers(
  authorized: AuthorizedSession,
  filters: Partial<Parameters<typeof getUsersCore>[0]['filters']>,
  includeUnreadCounts: boolean
): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> {
  return runAdmittedAction(authorized, async () => {
    const { session, authority } = authorized;
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
  });
}

const guardedGetAgents = memberGuarded(
  async (authorized): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> => {
    return runAdmittedAction(authorized, async () => {
      const { session, authority } = authorized;
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
    });
  }
);

const guardedGetStaff = memberGuarded(
  async (authorized): ActionResult<Awaited<ReturnType<typeof getUsersCore>>> => {
    return runAdmittedAction(authorized, async () => {
      const { session, authority } = authorized;
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
    });
  }
);

export async function getUsers(...args: Parameters<typeof guardedGetUsers>) {
  return guardedGetUsers(...args);
}

export async function getUserChoices(...args: Parameters<typeof guardedGetUserChoices>) {
  return guardedGetUserChoices(...args);
}

export async function getAgents(...args: Parameters<typeof guardedGetAgents>) {
  return guardedGetAgents(...args);
}

export async function getStaff(...args: Parameters<typeof guardedGetStaff>) {
  return guardedGetStaff(...args);
}
