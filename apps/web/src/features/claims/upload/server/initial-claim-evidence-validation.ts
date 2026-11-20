import type { EvidenceFile } from '@interdomestik/domain-claims/validators/claims';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { validateEvidenceFile } from '../evidence-file-policy';
import { verifyInitialClaimUploadIntentToken } from './initial-claim-upload';
import { validateStoredObject } from './stored-object-validation';
import { assertEvidenceTenantAuthority } from './persisted-evidence';
import { validateEvidenceContent } from './validate-evidence-content';

export async function validateInitialClaimEvidenceUpload(params: {
  authority: TenantAuthority;
  actorId: string;
  expectedBucket: string;
  file: EvidenceFile;
  tenantId: string;
}): Promise<void> {
  const { actorId, expectedBucket, file, tenantId } = params;
  assertEvidenceTenantAuthority(params);

  const intentResult = verifyInitialClaimUploadIntentToken({
    actorId,
    bucket: expectedBucket,
    fileId: file.id,
    fileSize: file.size,
    intentToken: file.uploadIntentToken ?? '',
    mimeType: file.type,
    storagePath: file.path,
    tenantId,
  });

  if (!intentResult.success) {
    throw new Error(intentResult.error);
  }

  const validation = validateEvidenceFile(file.name, file.size, file.type);
  const pathValidation = validateEvidenceFile(file.path, file.size, file.type);
  if (!validation.success) throw new Error(validation.error);
  if (
    !pathValidation.success ||
    validation.format.mimeType !== file.type ||
    pathValidation.format.mimeType !== file.type
  ) {
    throw new Error('evidence_unsupported');
  }

  const storedObjectResult = await validateStoredObject({
    bucket: expectedBucket,
    fileSize: file.size,
    logPrefix: '[claim-wizard-upload]',
    mimeType: file.type,
    storagePath: file.path,
    tenantId,
  });

  if (!storedObjectResult.success) {
    throw new Error(storedObjectResult.error);
  }

  const content = await validateEvidenceContent({
    authority: params.authority,
    bucket: expectedBucket,
    storagePath: file.path,
    tenantId,
    format: validation.format,
  });
  if (!content.success) throw new Error(content.error);
}
