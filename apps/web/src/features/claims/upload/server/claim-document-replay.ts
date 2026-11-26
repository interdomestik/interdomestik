import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { hasClaimEvidenceDocument } from '@interdomestik/domain-documents/claim-evidence';
import { assertEvidenceTenantAuthority } from './persisted-evidence';

/** An advisory hint for storage I/O. Only the locked confirmation can accept a replay. */
export async function hasPersistedClaimDocument(params: {
  authority: TenantAuthority;
  tenantId: string;
  claimId: string;
  actorId: string;
  fileId: string;
}): Promise<boolean> {
  assertEvidenceTenantAuthority(params);
  return withTenantAuthority(params.authority, tx =>
    hasClaimEvidenceDocument(tx, params, params.fileId)
  );
}
