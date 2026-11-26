import 'server-only';

import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readClaimUploadPaused } from '@interdomestik/domain-claims/claims/inbound-upload';
import { parameterFreeFailure } from '@/actions/staff-claims/register-failure';
import * as Sentry from '@sentry/nextjs';

export async function isClaimUploadPaused(
  authority: TenantAuthority,
  homeTenantId: string,
  claimId: string
): Promise<boolean> {
  try {
    return await readClaimUploadPaused(authority, homeTenantId, claimId);
  } catch (error) {
    Sentry.captureException(parameterFreeFailure(error, 'claim upload cutover'));
    return true;
  }
}
