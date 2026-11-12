import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { assertEvidenceTenantAuthority, hasPersistedEvidenceReference } from './persisted-evidence';
import { evidenceSignatureMatches, type EvidenceFormat } from '../evidence-file-policy';
import { readTenantObjectPrefix } from '@/lib/storage/object-prefix';
import { removeTenantObject, usesDeterministicE2EStorage } from '@/lib/storage/service-role';
import type { ConfirmedUploadValidationResult } from './claim-upload-intent';

export async function validateEvidenceContent(params: {
  authority: TenantAuthority;
  bucket: string;
  storagePath: string;
  tenantId: string;
  format: EvidenceFormat;
}): Promise<ConfirmedUploadValidationResult> {
  const target = {
    bucket: params.bucket,
    path: params.storagePath,
    tenantId: params.tenantId,
    family: 'claims' as const,
    context: 'claim evidence signature verification',
  };
  try {
    assertEvidenceTenantAuthority(params);
    // Preserve the existing local-only, credential-free storage test adapter.
    if (usesDeterministicE2EStorage()) return { success: true };
    const prefix = await readTenantObjectPrefix(target);
    if (evidenceSignatureMatches(params.format, prefix)) return { success: true };
    if (await hasPersistedEvidenceReference(params)) {
      return { success: false, error: 'evidence_content_mismatch', status: 409 };
    }
    const removed = await removeTenantObject(target);
    if (removed.error) return { success: false, error: 'evidence_upload_failed', status: 500 };
    return { success: false, error: 'evidence_content_mismatch', status: 409 };
  } catch {
    return { success: false, error: 'evidence_upload_failed', status: 500 };
  }
}
