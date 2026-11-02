import { eq, user, withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { resolveTenantId } from './utils';

export type TenantClassificationResolutionMode = 'confirm_current' | 'reassign';

export type ResolveTenantClassificationResult = {
  previousTenantId: string;
  tenantId: string;
  previousPending: boolean;
  tenantClassificationPending: boolean;
  resolutionMode: TenantClassificationResolutionMode;
};

type TenantResolutionContext = {
  currentTenantId: string;
  nextTenantId: string;
  resolutionMode: TenantClassificationResolutionMode;
};

async function validateResolutionInput(params: {
  session: UserSession | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<TenantResolutionContext>> {
  const { session, userId, currentTenantId, targetTenantId } = params;
  try {
    const adminSession = await requireTenantAdminSession(session);
    const sessionTenantId = ensureTenantId(adminSession);

    if (!userId.trim()) {
      return { error: 'User ID is required' };
    }

    const normalizedCurrentTenantId = currentTenantId.trim();
    if (!normalizedCurrentTenantId) {
      return { error: 'Current tenant is required' };
    }

    if (adminSession.user.role !== 'super_admin' && normalizedCurrentTenantId !== sessionTenantId) {
      return { error: 'Unauthorized' };
    }

    const nextTenantId = resolveTenantId(adminSession, targetTenantId ?? null);
    // Moving a user between tenants is a platform action: only super_admin may reassign.
    if (nextTenantId !== normalizedCurrentTenantId && adminSession.user.role !== 'super_admin') {
      return { error: 'Unauthorized' };
    }

    return {
      success: true,
      data: {
        currentTenantId: normalizedCurrentTenantId,
        nextTenantId,
        resolutionMode: nextTenantId === normalizedCurrentTenantId ? 'confirm_current' : 'reassign',
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return { error: 'Unauthorized' };
    }
    throw error;
  }
}

// Pilot policy (owner decision, review 081/A): online cross-tenant reassignment is unavailable for
// every role, super_admin included. A dependent writer that read the user's tenant earlier could
// still commit an old-tenant row after a move, because child rows reference user.id only. Only
// confirming the current tenant is supported until a writer-safe transfer protocol exists.
export const TENANT_REASSIGNMENT_UNAVAILABLE_ERROR = 'Tenant reassignment is unavailable';

async function confirmCurrentTenant(
  userId: string,
  currentTenantId: string
): Promise<{ previousPending: boolean } | null> {
  return withTenantContext({ tenantId: currentTenantId }, async tx => {
    const currentUser = await tx.query.user.findFirst({
      where: withTenant(currentTenantId, user.tenantId, eq(user.id, userId)),
      columns: { id: true, tenantClassificationPending: true },
    });
    if (!currentUser) return null;

    const updated = await tx
      .update(user)
      .set({ tenantClassificationPending: false })
      .where(withTenant(currentTenantId, user.tenantId, eq(user.id, userId)))
      .returning({ id: user.id });
    if (updated.length !== 1) return null;

    return { previousPending: currentUser.tenantClassificationPending === true };
  });
}

export async function resolveTenantClassificationCore(params: {
  session: UserSession | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<ResolveTenantClassificationResult>> {
  const validation = await validateResolutionInput(params);
  if ('error' in validation) {
    return validation;
  }

  if (!validation.data) {
    return { error: 'Failed to resolve tenant classification' };
  }

  const { currentTenantId, nextTenantId, resolutionMode } = validation.data;
  if (resolutionMode === 'reassign') {
    return { error: TENANT_REASSIGNMENT_UNAVAILABLE_ERROR };
  }

  try {
    const confirmed = await confirmCurrentTenant(params.userId, currentTenantId);
    if (!confirmed) {
      return { error: 'User not found' };
    }

    return {
      success: true,
      data: {
        previousTenantId: currentTenantId,
        tenantId: nextTenantId,
        previousPending: confirmed.previousPending,
        tenantClassificationPending: false,
        resolutionMode,
      },
    };
  } catch (error) {
    console.error('Failed to resolve tenant classification:', error);
    return { error: 'Failed to resolve tenant classification' };
  }
}
