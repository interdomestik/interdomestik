import type { EvidenceFile } from '@interdomestik/domain-claims/validators/claims';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';
import { validateEvidenceFile } from '../evidence-file-policy';
import { verifyInitialClaimUploadIntentToken } from './initial-claim-upload';
import { isMemberUploadRole } from './member-upload-role';
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
  // The row stores `file.bucket`: it must be the very bucket the intent and object are verified in.
  if (file.bucket !== expectedBucket) throw new Error('evidence_bucket_mismatch');

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

/**
 * The `validateSubmittedClaimFile` dependency of the claims domain: every claim command that turns
 * a client-named initial upload into a document row (submit, draft update) verifies it here. With
 * `actorRole`, the actor must also hold a member upload role, the roles initial intents are minted
 * for; a read-only owner of a claim never attaches a new file.
 */
export function initialClaimEvidenceValidatorFor(
  authority: TenantAuthority | null,
  options: { actorRole?: string | null } = {}
) {
  const checkRole = 'actorRole' in options;
  return ({
    actorId,
    file,
    tenantId,
  }: {
    actorId: string;
    file: EvidenceFile;
    tenantId: string;
  }): Promise<void> => {
    if (!authority) throw new Error('Missing tenant authority');
    if (checkRole && !isMemberUploadRole(options.actorRole)) {
      throw new Error('evidence_upload_forbidden');
    }
    return validateInitialClaimEvidenceUpload({
      authority,
      actorId,
      expectedBucket: resolveEvidenceBucketName(),
      file,
      tenantId,
    });
  };
}
