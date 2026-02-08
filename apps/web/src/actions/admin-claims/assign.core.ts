import { assignClaimCore as assignClaimCoreDomain } from '@interdomestik/domain-claims/agent-claims/assign';
import { db } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';

import { logAuditEvent } from '@/lib/audit';
import { notifyClaimAssigned } from '@/lib/notifications';
import { revalidatePath } from 'next/cache';

import type { Session } from './context';

const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function revalidatePathForAllLocales(path: string) {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export async function assignClaimCore(params: {
  claimId: string;
  staffId: string | null;
  session: NonNullable<Session> | null;
  requestHeaders: Headers;
}) {
  if (!params.session?.user?.tenantId) {
    return { success: false, error: 'Unauthorized', data: undefined };
  }

  const tenantId = params.session.user.tenantId;
  const claim = await db.query.claims.findFirst({
    where: (claimsTable, { eq }) =>
      withTenant(tenantId, claimsTable.tenantId, eq(claimsTable.id, params.claimId)),
    columns: {
      id: true,
      staffId: true,
    },
  });

  if (!claim) {
    return { success: false, error: 'Claim not found', data: undefined };
  }

  if (claim.staffId === params.staffId) {
    return { success: true, error: undefined };
  }

  const result = await assignClaimCoreDomain(params, {
    logAuditEvent,
    notifyClaimAssigned,
  });

  if (result.success) {
    revalidatePathForAllLocales('/member/claims');
    revalidatePathForAllLocales(`/member/claims/${params.claimId}`);
    revalidatePathForAllLocales('/admin/claims');
    revalidatePathForAllLocales(`/admin/claims/${params.claimId}`);
    revalidatePathForAllLocales('/staff/claims');
    revalidatePathForAllLocales(`/staff/claims/${params.claimId}`);
  }

  return result;
}
