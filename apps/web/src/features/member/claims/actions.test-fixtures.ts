import { createClaimUploadIntentToken } from '@/features/claims/upload/server/shared-upload';
import type { ConfirmUploadParams } from './upload-consent';

export function createUploadIntent(
  overrides: Partial<{
    actorId: string;
    bucket: string;
    claimId: string;
    fileId: string;
    fileSize: number;
    informationRequestId: string;
    mimeType: string;
    storagePath: string;
    tenantId: string;
  }> = {}
) {
  return createClaimUploadIntentToken({
    actorId: 'member-1',
    bucket: 'claim-evidence',
    claimId: 'claim-1',
    fileId: 'uuid-1',
    fileSize: 1024,
    mimeType: 'application/pdf',
    storagePath: 'pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf',
    tenantId: 'tenant-1',
    ...overrides,
  });
}

export function createConfirmUploadParams(
  overrides: Partial<ConfirmUploadParams> = {}
): ConfirmUploadParams {
  return {
    claimId: 'claim-1',
    storagePath: 'pii/tenants/tenant-1/claims/claim-1/uuid-1.pdf',
    originalName: 'evidence.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024,
    fileId: 'uuid-1',
    uploadIntentToken: createUploadIntent(),
    uploadedBucket: 'claim-evidence',
    ...overrides,
  };
}
