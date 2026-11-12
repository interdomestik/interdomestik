import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { assertEvidenceTenantAuthority } from './persisted-evidence';
import { evidenceSignatureMatches, type EvidenceFormat } from '../evidence-file-policy';
import { readTenantObjectPrefix, readTenantObjectTail } from '@/lib/storage/object-prefix';
import { usesDeterministicE2EStorage } from '@/lib/storage/service-role';
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
    const tail = ['docx', 'xlsx'].includes(params.format.signature)
      ? await readTenantObjectTail(target)
      : undefined;
    if (evidenceSignatureMatches(params.format, prefix, tail)) return { success: true };
    // A live create-only upload token can recreate this path. Request-time deletion
    // could race with a valid re-upload and persistence; leave rejected private bytes intact.
    return { success: false, error: 'evidence_content_mismatch', status: 409 };
  } catch {
    return { success: false, error: 'evidence_upload_failed', status: 500 };
  }
}
