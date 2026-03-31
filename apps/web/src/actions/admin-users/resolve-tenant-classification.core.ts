import { revalidatePath } from 'next/cache';

import {
  resolveTenantClassificationCore as resolveTenantClassificationDomain,
  type ResolveTenantClassificationResult,
} from '@interdomestik/domain-users/admin/resolve-tenant-classification';
import type { UserSession } from '@interdomestik/domain-users/types';

import { logAuditEvent } from '@/lib/audit';

import type { Session } from './context';

const LOCALES = ['en', 'sq', 'mk', 'sr'] as const;

function revalidateAdminUserPaths(userId: string) {
  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/users`);
    revalidatePath(`/${locale}/admin/users/${userId}`);
  }
}

export async function resolveTenantClassificationCore(params: {
  session: NonNullable<Session> | null;
  userId: string;
  currentTenantId: string;
  nextTenantId?: string | null;
}) {
  const result = await resolveTenantClassificationDomain({
    session: params.session as UserSession | null,
    userId: params.userId,
    currentTenantId: params.currentTenantId,
    targetTenantId: params.nextTenantId ?? null,
  });

  if ('error' in result) {
    return result;
  }

  const data = result.data as ResolveTenantClassificationResult;
  revalidateAdminUserPaths(params.userId);

  await logAuditEvent({
    actorId: params.session?.user?.id ?? null,
    actorRole: params.session?.user?.role ?? null,
    tenantId: params.currentTenantId,
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

  return result;
}
