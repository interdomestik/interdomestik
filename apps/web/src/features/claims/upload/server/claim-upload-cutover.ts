// No 'server-only' marker: the Node-importable upload cores (and their Playwright specs) load
// this module, like the other modules those cores import. Every importer is server code.
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { readClaimUploadPaused } from '@interdomestik/domain-claims/claims/inbound-upload';
import { parameterFreeFailure } from '@/actions/staff-claims/register-failure';
import * as Sentry from '@sentry/nextjs';

export async function isClaimUploadPaused(
  authority: TenantAuthority,
  homeTenantId: string,
  claimId: string,
  mode: 'staff' | 'self-supply' = 'staff'
): Promise<boolean> {
  try {
    return await readClaimUploadPaused(authority, homeTenantId, claimId, mode);
  } catch (error) {
    Sentry.captureException(parameterFreeFailure(error, 'claim upload cutover'));
    return true;
  }
}
