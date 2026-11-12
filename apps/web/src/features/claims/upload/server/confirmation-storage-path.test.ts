import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildEvidenceStoragePath } from './storage-path';
import { createClaimUploadIntentToken, validateConfirmedClaimUpload } from './shared-upload';
describe('confirmation storage path invariants', () => {
  beforeEach(() => {
    process.env.CLAIM_UPLOAD_INTENT_SECRET = 'test-upload-intent-secret-value-123456';
    process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET = 'claim-evidence';
  });
  afterEach(() => {
    delete process.env.CLAIM_UPLOAD_INTENT_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET;
  });
  it('keeps mismatched intent metadata rejected before storage verification', async () => {
    const storagePath = buildEvidenceStoragePath({
      bucket: 'claim-evidence',
      claimId: 'claim-1',
      fileId: 'file-1',
      fileName: 'receipt.pdf',
      shape: 'assigned',
      tenantId: 'tenant-1',
    });
    const uploadIntentToken = createClaimUploadIntentToken({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      claimId: 'claim-1',
      fileId: 'file-1',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storagePath,
      tenantId: 'tenant-1',
    });

    await expect(
      validateConfirmedClaimUpload({
        authority: mintTestTenantAuthority('tenant-1'),
        actorId: 'member-1',
        bucket: 'claim-evidence',
        confirmation: {
          claimId: 'claim-1',
          fileId: 'file-1',
          fileSize: 2048,
          mimeType: 'application/pdf',
          storagePath,
          uploadIntentToken,
        },
        logPrefix: '[storage-path-test]',
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      status: 409,
    });
  });

  it('pins assigned upload confirmation to the centralized bucket invariant', async () => {
    const storagePath = 'pii/tenants/tenant-1/claims/claim-1/file-1.pdf';
    const uploadIntentToken = createClaimUploadIntentToken({
      actorId: 'member-1',
      bucket: 'policy-documents',
      claimId: 'claim-1',
      fileId: 'file-1',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storagePath,
      tenantId: 'tenant-1',
    });

    await expect(
      validateConfirmedClaimUpload({
        authority: mintTestTenantAuthority('tenant-1'),
        actorId: 'member-1',
        bucket: 'policy-documents',
        confirmation: {
          claimId: 'claim-1',
          fileId: 'file-1',
          fileSize: 1024,
          mimeType: 'application/pdf',
          storagePath,
          uploadIntentToken,
        },
        logPrefix: '[storage-path-test]',
        tenantId: 'tenant-1',
      })
    ).resolves.toEqual({
      success: false,
      error: 'Uploaded file metadata mismatch. Please retry upload.',
      status: 409,
    });
  });
});
