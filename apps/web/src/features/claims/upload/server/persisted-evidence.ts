import { and, claimDocuments, eq } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

type EvidenceTenant = { authority: TenantAuthority; tenantId: string };

export function assertEvidenceTenantAuthority(params: EvidenceTenant): void {
  if (readTenantAuthority(params.authority).tenantId !== params.tenantId) {
    throw new Error('Evidence tenant authority mismatch');
  }
}

/** Read references under the caller's existing tenant/RLS boundary before any cleanup. */
export async function hasPersistedEvidenceReference(
  params: EvidenceTenant & {
    bucket: string;
    storagePath: string;
  }
): Promise<boolean> {
  assertEvidenceTenantAuthority(params);
  return await withTenantAuthority(params.authority, async tx => {
    const [row] = await tx
      .select({ id: claimDocuments.id })
      .from(claimDocuments)
      .where(
        and(
          eq(claimDocuments.tenantId, params.tenantId),
          eq(claimDocuments.filePath, params.storagePath),
          eq(claimDocuments.bucket, params.bucket)
        )
      )
      .limit(1);
    return Boolean(row);
  });
}
