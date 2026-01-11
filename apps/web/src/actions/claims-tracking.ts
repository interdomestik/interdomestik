'use server';

import { createPublicTrackingLink as createPublicTrackingLinkCore } from '@/features/claims/tracking/server/createPublicTrackingLink';
import { auth } from '@/lib/auth';
import { ensureClaimsAccess } from '@/server/domains/claims/guards';
import { headers } from 'next/headers';

export async function createPublicTrackingLink(claimId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  const access = ensureClaimsAccess(session);

  return createPublicTrackingLinkCore(claimId, {
    tenantId: access.tenantId,
    actorUserId: access.userId,
    role: access.role,
    branchId: access.branchId,
  });
}
