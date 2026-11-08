import { revalidatePath } from 'next/cache';

import { delegateSuperAdminTenant } from '@interdomestik/database';
import {
  resolveTenantClassificationCore as resolveTenantClassificationDomain,
  type ResolveTenantClassificationResult,
} from '@interdomestik/domain-users/admin/resolve-tenant-classification';
import type { UserSession } from '@interdomestik/domain-users/types';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';

import { logAuditEvent } from '@/lib/audit';

import type { Session } from './context';

const LOCALES = ['en', 'sq', 'mk', 'sr', 'de'] as const;

function revalidateAdminUserPaths(userId: string) {
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/users`);
    revalidatePath(`/${locale}/admin/users/${userId}`);
  }
}

// The audit row belongs to the tenant of the user being classified: the caller's own authority, or
// for a super_admin naming another active tenant, the same delegation the domain resolved.
async function resolveAuditAuthority(params: {
  authority: TenantAuthority | null;
  role: string | null | undefined;
  tenantId: string;
}): Promise<TenantAuthority | null> {
  const { authority, role, tenantId } = params;
  if (!authority) return null;
  if (readTenantAuthority(authority).tenantId === tenantId) return authority;
  if (role !== 'super_admin') return null;
  return delegateSuperAdminTenant(authority, tenantId);
}

export async function resolveTenantClassificationCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  userId: string;
  currentTenantId: string;
  nextTenantId?: string | null;
}) {
  const result = await resolveTenantClassificationDomain({
    session: params.session as UserSession | null,
    authority: params.authority,
    userId: params.userId,
    currentTenantId: params.currentTenantId,
    targetTenantId: params.nextTenantId ?? null,
  });

  if ('error' in result) {
    return result;
  }

  const data = result.data as ResolveTenantClassificationResult;
  revalidateAdminUserPaths(params.userId);

  const auditAuthority = await resolveAuditAuthority({
    authority: params.authority,
    role: params.session?.user?.role,
    tenantId: params.currentTenantId,
  });
  if (auditAuthority) {
    await logAuditEvent({
      actorId: params.session?.user?.id ?? null,
      actorRole: params.session?.user?.role ?? null,
      authority: auditAuthority,
      action:
        data.resolutionMode === 'reassign'
          ? 'user.tenant_reassigned'
          : 'user.tenant_classification_confirmed',
      entityType: 'user',
      entityId: params.userId,
      metadata: {
        previousTenantId: data.previousTenantId,
        tenantId: data.tenantId,
        previousPending: data.previousPending,
        tenantClassificationPending: data.tenantClassificationPending,
        resolutionMode: data.resolutionMode,
      },
    });
  }

  return {
    success: true,
    data,
  };
}
