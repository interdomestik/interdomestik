'use server';

import { createPublicTrackingLink as createPublicTrackingLinkCore } from '@/features/claims/tracking/server/createPublicTrackingLink';
import { authorizeSessionTenant } from '@/lib/tenant-authority.server';
import { ensureClaimsAccess } from '@/server/domains/claims/guards';
import { UnauthorizedError } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';

export async function createPublicTrackingLink(claimId: string) {
  const authorized = await authorizeSessionTenant(await headers());
  if (!authorized) throw new UnauthorizedError();
  const access = ensureClaimsAccess(authorized.session);

  return createPublicTrackingLinkCore(claimId, {
    authority: authorized.authority,
    actorUserId: access.userId,
    role: access.role,
    branchId: access.branchId,
  });
}
