import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { isMemberUploadRole } from '@interdomestik/domain-claims/claims/evidence-confirmation';
import { validateEvidenceFile } from '../evidence-file-policy';
import { validateEvidenceContent } from './validate-evidence-content';
import { validateStoredObject } from './stored-object-validation';
import { hasPersistedClaimDocument } from './claim-document-replay';
import { persistClaimDocumentMetadata } from './claim-document-write';
import { buildMemberAiExtractionConsent, type ConfirmUploadParams } from './upload-consent';
import {
  expectedUploadPath,
  verifyClaimUploadIntentToken,
  type ConfirmedUploadValidationResult,
} from './claim-upload-intent';

export type ClaimUploadConfirmationInput = Pick<
  ConfirmUploadParams,
  'aiExtractionConsentGranted' | 'aiExtractionConsentLocale'
> & {
  claimId: string;
  fileId: string;
  originalName?: string;
  category?: 'evidence' | 'legal';
  fileSize: number;
  informationRequestId?: string;
  mimeType: string;
  storageContentType?: string;
  storagePath: string;
  uploadIntentToken: string;
};

export async function validateConfirmedClaimUpload(params: {
  authority: TenantAuthority;
  actorId: string;
  bucket: string;
  confirmation: ClaimUploadConfirmationInput;
  logPrefix: string;
  tenantId: string;
}): Promise<ConfirmedUploadValidationResult> {
  const { actorId, bucket, confirmation, logPrefix, tenantId } = params;
  const {
    claimId,
    fileId,
    fileSize,
    informationRequestId,
    mimeType,
    storageContentType,
    storagePath,
    uploadIntentToken,
  } = confirmation;

  if (!expectedUploadPath({ bucket, claimId, fileId, storagePath, tenantId })) {
    return {
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    };
  }

  const validation = validateEvidenceFile(storagePath, fileSize, mimeType);
  if (!validation.success) return { success: false, error: validation.error, status: 409 };
  const namedFormat = validateEvidenceFile(
    confirmation.originalName ?? storagePath,
    fileSize,
    mimeType
  );
  if (
    !namedFormat.success ||
    namedFormat.format.mimeType !== mimeType ||
    validation.format.mimeType !== mimeType ||
    (storageContentType ?? mimeType) !== mimeType
  ) {
    return { success: false, error: 'evidence_unsupported', status: 409 };
  }

  const intentResult = verifyClaimUploadIntentToken({
    actorId,
    bucket,
    claimId,
    fileId,
    fileSize,
    informationRequestId,
    intentToken: uploadIntentToken,
    mimeType,
    storageContentType,
    storagePath,
    tenantId,
  });

  if (!intentResult.success) {
    return intentResult;
  }

  const { principal, tenantId: authorityTenantId } = readTenantAuthority(params.authority);
  if (!principal || principal.userId !== actorId || authorityTenantId !== tenantId) {
    return {
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    };
  }
  const memberSurface = isMemberUploadRole(principal.role);
  if (informationRequestId !== undefined && !memberSurface) {
    return { success: false, error: 'Information request not found', status: 409 };
  }

  if (
    await hasPersistedClaimDocument({
      authority: params.authority,
      tenantId,
      claimId,
      actorId,
      fileId,
    })
  ) {
    await persistClaimDocumentMetadata(
      {
        authority: params.authority,
        tenantId,
        claimId,
        fileId,
        fileSize,
        mimeType,
        originalName: confirmation.originalName ?? '',
        resolvedBucket: bucket,
        storagePath,
        category: confirmation.category ?? 'evidence',
        logPrefix,
        userId: actorId,
        actorRole: memberSurface ? 'member' : (principal.role ?? undefined),
        informationRequestId,
        aiExtractionConsent: memberSurface
          ? buildMemberAiExtractionConsent(confirmation)
          : undefined,
      },
      true
    );
    return { success: true, replayed: true };
  }

  const stored = await validateStoredObject({
    bucket,
    fileSize,
    logPrefix,
    mimeType,
    storagePath,
    tenantId,
  });
  if (!stored.success) return stored;
  return validateEvidenceContent({
    authority: params.authority,
    bucket,
    storagePath,
    tenantId,
    format: validation.format,
  });
}
