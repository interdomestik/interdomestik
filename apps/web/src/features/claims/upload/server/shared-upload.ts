import { requestClaimUploadSignature } from './claim-upload-signature';
export {
  validateConfirmedClaimUpload,
  type ClaimUploadConfirmationInput,
} from './confirmed-claim-upload-validation';
import { refuseUnapprovedUpload } from './refuse-unapproved-upload';
export { validateStoredObject } from './stored-object-validation';
import { LOCALES } from '@/i18n/locales';
import { redactSignedUrlErrorDetails } from '@/lib/storage/signed-url-exposure';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

import { assertEvidenceStoragePath, buildEvidenceStoragePath } from './storage-path';
import { createClaimUploadIntentToken } from './claim-upload-intent';
export { createClaimUploadIntentToken } from './claim-upload-intent';
export {
  InformationRequestUploadConflictError,
  persistClaimDocumentAndQueueWorkflows,
  type UploadCategory,
} from './claim-document-persistence';

export type SharedGenerateUploadUrlResult =
  | {
      success: true;
      url: string;
      path: string;
      id: string;
      token: string;
      bucket: string;
      deterministicE2E?: true;
      intentToken: string;
    }
  | { success: false; error: string; status: 400 | 413 | 500 };

export function revalidatePathForAllLocales(path: string): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}${path}`);
  }
}

export function sanitizeClaimUploadExtension(fileName: string): string {
  const ext =
    fileName
      .split('.')
      .pop()
      ?.toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '') || 'bin';
  return ext.slice(0, 16) || 'bin';
}

export async function createSignedUploadUrl(params: {
  actorId: string;
  bucket: string;
  claimId: string;
  fileName: string;
  fileSize: number;
  informationRequestId?: string;
  logPrefix: string;
  mimeType: string;
  storageContentType?: string;
  tenantId: string;
}): Promise<SharedGenerateUploadUrlResult> {
  const {
    actorId,
    bucket,
    claimId,
    fileName,
    fileSize,
    informationRequestId,
    logPrefix,
    mimeType,
    storageContentType,
    tenantId,
  } = params;

  const refusal = refuseUnapprovedUpload({ fileName, fileSize, mimeType, storageContentType });
  if (refusal) return refusal;

  const fileId = randomUUID();
  let path: string;

  try {
    path = buildEvidenceStoragePath({
      bucket,
      claimId,
      fileId,
      fileName,
      shape: 'assigned',
      tenantId,
    });
    assertEvidenceStoragePath({
      bucket,
      claimId,
      fileId,
      shape: 'assigned',
      storagePath: path,
      tenantId,
    });
  } catch {
    return { success: false, error: 'Invalid file name', status: 400 };
  }

  try {
    const data = await requestClaimUploadSignature({ bucket, path, tenantId, logPrefix });
    if (!data) return { success: false, error: 'evidence_upload_failed', status: 500 };
    return {
      success: true,
      url: data.signedUrl,
      path,
      id: fileId,
      token: data.token,
      bucket,
      deterministicE2E: data.deterministicE2E,
      intentToken: createClaimUploadIntentToken({
        actorId,
        bucket,
        claimId,
        fileId,
        fileSize,
        informationRequestId,
        mimeType,
        storageContentType,
        storagePath: path,
        tenantId,
      }),
    };
  } catch (error) {
    console.error(`${logPrefix} generate upload URL error`, redactSignedUrlErrorDetails(error));
    return { success: false, error: 'evidence_upload_failed', status: 500 };
  }
}
