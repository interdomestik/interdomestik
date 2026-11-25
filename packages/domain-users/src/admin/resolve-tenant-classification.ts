import { and, eq, user } from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { ensureTenantId } from '@interdomestik/shared-auth';

import type { ActionResult, UserSession } from '../types';
import { requireTenantAdminSession } from './access';
import { resolveTenantAuthority, resolveTenantId } from './utils';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const isUnauthorizedRefusal = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === 'UnauthorizedError' &&
  (error as { code?: unknown }).code === 'UNAUTHORIZED';

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
  currentAuthority: TenantAuthority;
  nextTenantId: string;
  resolutionMode: TenantClassificationResolutionMode;
};

async function validateResolutionInput(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
  userId: string;
  currentTenantId: string;
  targetTenantId?: string | null;
}): Promise<ActionResult<TenantResolutionContext>> {
  const { session, authority, userId, currentTenantId, targetTenantId } = params;
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
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    const nextTenantId = resolveTenantId(adminSession, targetTenantId ?? null);
    // Moving a user between tenants is a platform action: only super_admin may reassign.
    if (nextTenantId !== normalizedCurrentTenantId && adminSession.user.role !== 'super_admin') {
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
    }

    // The session authority for the caller's own tenant; a super_admin naming another (active)
    // tenant gets a delegated authority scoped to it. Anything else fails closed as Unauthorized.
    const currentAuthority = await resolveTenantAuthority(
      adminSession,
      authority,
      normalizedCurrentTenantId
    );

    return {
      success: true,
      data: {
        currentTenantId: normalizedCurrentTenantId,
        currentAuthority,
        nextTenantId,
        resolutionMode: nextTenantId === normalizedCurrentTenantId ? 'confirm_current' : 'reassign',
      },
    };
  } catch (error) {
    // Only the typed refusal of the authority helpers; any other failure is unexpected and rethrown.
    if (isUnauthorizedRefusal(error)) {
      return { error: 'Unauthorized', code: 'UNAUTHORIZED' };
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
  currentTenantId: string,
  currentAuthority: TenantAuthority
): Promise<{ previousPending: boolean } | 'EMAIL_NOT_PROVEN' | null> {
  return withTenantAuthority(currentAuthority, async tx => {
    const currentUser = await tx.query.user.findFirst({
      where: withTenant(currentTenantId, user.tenantId, eq(user.id, userId)),
      columns: { id: true, tenantClassificationPending: true },
    });
    if (!currentUser) return null;

    // Mailbox proof can revoke credentials created before verification. Keep the account pending
    // until this update observes a proven mailbox.
    const updated = await tx
      .update(user)
      .set({ tenantClassificationPending: false })
      .where(
        withTenant(
          currentTenantId,
          user.tenantId,
          and(eq(user.id, userId), eq(user.emailVerified, true))
        )
      )
      .returning({ id: user.id });
    if (updated.length !== 1) {
      return 'EMAIL_NOT_PROVEN';
    }

    return { previousPending: currentUser.tenantClassificationPending === true };
  });
}

export async function resolveTenantClassificationCore(params: {
  session: UserSession | null;
  authority: TenantAuthority | null;
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

  const { currentTenantId, currentAuthority, nextTenantId, resolutionMode } = validation.data;
  if (resolutionMode === 'reassign') {
    return { error: TENANT_REASSIGNMENT_UNAVAILABLE_ERROR };
  }

  try {
    const confirmed = await confirmCurrentTenant(params.userId, currentTenantId, currentAuthority);
    if (!confirmed) {
      return { error: 'User not found' };
    }
    if (confirmed === 'EMAIL_NOT_PROVEN') {
      return { error: confirmed, code: confirmed };
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
