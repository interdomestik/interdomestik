import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  validateStoredObject: vi.fn(),
}));

vi.mock('./shared-upload', () => ({
  validateStoredObject: hoisted.validateStoredObject,
}));

import {
  createInitialClaimUploadIntentToken,
  expectedInitialClaimUploadPath,
  validateInitialClaimEvidenceUpload,
  verifyInitialClaimUploadIntentToken,
} from './initial-claim-upload';

describe('initial claim upload intents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
    hoisted.validateStoredObject.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('verifies a server-issued upload intent for the exact generated file metadata', () => {
    const params = {
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: 'evidence-123',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storagePath: 'pii/tenants/tenant-1/claims/member-1/unassigned/evidence-123-receipt.pdf',
      tenantId: 'tenant-1',
    };

    const token = createInitialClaimUploadIntentToken(params);

    expect(verifyInitialClaimUploadIntentToken({ ...params, intentToken: token })).toEqual({
      success: true,
    });
  });

  it('rejects forged metadata even when the path stays inside the caller prefix', () => {
    const token = createInitialClaimUploadIntentToken({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: 'evidence-123',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storagePath: 'pii/tenants/tenant-1/claims/member-1/unassigned/evidence-123-receipt.pdf',
      tenantId: 'tenant-1',
    });

    expect(
      verifyInitialClaimUploadIntentToken({
        actorId: 'member-1',
        bucket: 'claim-evidence',
        fileId: 'evidence-123',
        fileSize: 2048,
        intentToken: token,
        mimeType: 'application/pdf',
        storagePath: 'pii/tenants/tenant-1/claims/member-1/unassigned/evidence-123-receipt.pdf',
        tenantId: 'tenant-1',
      })
    ).toEqual({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
    });
  });

  it('accepts only the initial claim upload path shape', () => {
    expect(
      expectedInitialClaimUploadPath({
        actorId: 'member-1',
        fileId: 'evidence-123',
        storagePath: 'pii/tenants/tenant-1/claims/member-1/unassigned/evidence-123-receipt.pdf',
        tenantId: 'tenant-1',
      })
    ).toBe(true);

    expect(
      expectedInitialClaimUploadPath({
        actorId: 'member-1',
        fileId: 'evidence-123',
        storagePath: 'pii/tenants/tenant-1/claims/member-1/other/evidence-123-receipt.pdf',
        tenantId: 'tenant-1',
      })
    ).toBe(false);
  });

  it('validates the stored object before accepting submitted evidence', async () => {
    const file = {
      id: 'evidence-123',
      name: 'receipt.pdf',
      path: 'pii/tenants/tenant-1/claims/member-1/unassigned/evidence-123-receipt.pdf',
      type: 'application/pdf',
      size: 1024,
      bucket: 'claim-evidence',
      classification: 'pii',
      category: 'evidence' as const,
    };
    const token = createInitialClaimUploadIntentToken({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: file.id,
      fileSize: file.size,
      mimeType: file.type,
      storagePath: file.path,
      tenantId: 'tenant-1',
    });

    await validateInitialClaimEvidenceUpload({
      actorId: 'member-1',
      expectedBucket: 'claim-evidence',
      file: { ...file, uploadIntentToken: token },
      tenantId: 'tenant-1',
    });

    expect(hoisted.validateStoredObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: 'claim-evidence',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storagePath: file.path,
      })
    );
  });

  it('rejects submitted evidence when the stored object is missing or mismatched', async () => {
    hoisted.validateStoredObject.mockResolvedValue({
      success: false,
      error: 'Uploaded file was not found in storage.',
      status: 409,
    });
    const file = {
      id: 'evidence-123',
      name: 'receipt.pdf',
      path: 'pii/tenants/tenant-1/claims/member-1/unassigned/evidence-123-receipt.pdf',
      type: 'application/pdf',
      size: 1024,
      bucket: 'claim-evidence',
      classification: 'pii',
      category: 'evidence' as const,
    };
    const token = createInitialClaimUploadIntentToken({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: file.id,
      fileSize: file.size,
      mimeType: file.type,
      storagePath: file.path,
      tenantId: 'tenant-1',
    });

    await expect(
      validateInitialClaimEvidenceUpload({
        actorId: 'member-1',
        expectedBucket: 'claim-evidence',
        file: { ...file, uploadIntentToken: token },
        tenantId: 'tenant-1',
      })
    ).rejects.toThrow('Uploaded file was not found in storage.');
  });
});
