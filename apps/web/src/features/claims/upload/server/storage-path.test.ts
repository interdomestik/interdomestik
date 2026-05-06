import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createInitialClaimUploadIntentToken,
  verifyInitialClaimUploadIntentToken,
} from './initial-claim-upload';
import { createClaimUploadIntentToken, validateConfirmedClaimUpload } from './shared-upload';
import {
  EVIDENCE_PATH_SEGMENTS,
  assertEvidenceStoragePath,
  buildEvidenceStoragePath,
} from './storage-path';

function expectInvalidAssignedStoragePath(
  storagePath: string,
  overrides: Partial<{
    bucket: string;
    claimId: string;
    fileId: string;
    tenantId: string;
  }> = {}
) {
  expect(() =>
    assertEvidenceStoragePath({
      bucket: 'claim-evidence',
      claimId: 'claim-1',
      fileId: 'file-1',
      shape: 'assigned',
      storagePath,
      tenantId: 'tenant-1',
      ...overrides,
    })
  ).toThrow(/Invalid evidence storage path/);
}

describe('evidence storage path invariants', () => {
  beforeEach(() => {
    process.env.CLAIM_UPLOAD_INTENT_SECRET = 'test-upload-intent-secret-value-123456';
    process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET = 'claim-evidence';
  });

  afterEach(() => {
    delete process.env.CLAIM_UPLOAD_INTENT_SECRET;
    delete process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET;
  });

  it('builds and asserts the assigned evidence path shape', () => {
    const storagePath = buildEvidenceStoragePath({
      bucket: 'claim-evidence',
      claimId: 'claim-1',
      fileId: 'file-1',
      fileName: 'receipt.pdf',
      shape: 'assigned',
      tenantId: 'tenant-1',
    });

    expect(storagePath).toBe('pii/tenants/tenant-1/claims/claim-1/file-1.pdf');
    expect(storagePath.split('/')).toHaveLength(EVIDENCE_PATH_SEGMENTS.assigned);
    expect(() =>
      assertEvidenceStoragePath({
        bucket: 'claim-evidence',
        claimId: 'claim-1',
        fileId: 'file-1',
        shape: 'assigned',
        storagePath,
        tenantId: 'tenant-1',
      })
    ).not.toThrow();
  });

  it('defaults assigned filenames without a real extension to bin', () => {
    expect(
      buildEvidenceStoragePath({
        bucket: 'claim-evidence',
        claimId: 'claim-1',
        fileId: 'file-1',
        fileName: 'john-doe-medical-record',
        shape: 'assigned',
        tenantId: 'tenant-1',
      })
    ).toBe('pii/tenants/tenant-1/claims/claim-1/file-1.bin');

    expect(
      buildEvidenceStoragePath({
        bucket: 'claim-evidence',
        claimId: 'claim-1',
        fileId: 'file-1',
        fileName: '.pdf',
        shape: 'assigned',
        tenantId: 'tenant-1',
      })
    ).toBe('pii/tenants/tenant-1/claims/claim-1/file-1.bin');
  });

  it('builds and asserts the initial unassigned evidence path shape', () => {
    const storagePath = buildEvidenceStoragePath({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: 'file-1',
      fileName: 'Receipt Final.pdf',
      shape: 'initial',
      tenantId: 'tenant-1',
    });

    expect(storagePath).toBe(
      'pii/tenants/tenant-1/claims/member-1/unassigned/file-1-Receipt_Final.pdf'
    );
    expect(storagePath.split('/')).toHaveLength(EVIDENCE_PATH_SEGMENTS.initial);
    expect(() =>
      assertEvidenceStoragePath({
        actorId: 'member-1',
        bucket: 'claim-evidence',
        fileId: 'file-1',
        shape: 'initial',
        storagePath,
        tenantId: 'tenant-1',
      })
    ).not.toThrow();
  });

  it('rejects cross-tenant assertion attempts', () => {
    expectInvalidAssignedStoragePath('pii/tenants/tenant-2/claims/claim-1/file-1.pdf');
  });

  it('rejects the wrong actor for initial upload paths', () => {
    expect(() =>
      assertEvidenceStoragePath({
        actorId: 'member-1',
        bucket: 'claim-evidence',
        fileId: 'file-1',
        shape: 'initial',
        storagePath: 'pii/tenants/tenant-1/claims/member-2/unassigned/file-1-receipt.pdf',
        tenantId: 'tenant-1',
      })
    ).toThrow(/Invalid evidence storage path/);
  });

  it('rejects the wrong claim for assigned upload paths', () => {
    expectInvalidAssignedStoragePath('pii/tenants/tenant-1/claims/claim-2/file-1.pdf');
  });

  it.each([
    ['fileName', { fileName: '../receipt.pdf' }],
    ['claimId', { claimId: 'claim-../1' }],
    ['tenantId', { tenantId: 'tenant/1' }],
  ])('rejects path traversal via %s', (_label, overrides) => {
    expect(() =>
      buildEvidenceStoragePath({
        bucket: 'claim-evidence',
        claimId: 'claim-1',
        fileId: 'file-1',
        fileName: 'receipt.pdf',
        shape: 'assigned',
        tenantId: 'tenant-1',
        ...overrides,
      })
    ).toThrow(/Invalid evidence storage path/);
  });

  it('rejects assigned paths with too few segments', () => {
    expectInvalidAssignedStoragePath('pii/tenants/tenant-1/claims/claim-1');
  });

  it('rejects assigned paths with too many segments', () => {
    expectInvalidAssignedStoragePath('pii/tenants/tenant-1/claims/claim-1/file-1.pdf/extra');
  });

  it('rejects the wrong pii tenant prefix', () => {
    expectInvalidAssignedStoragePath('pii/tenant/tenant-1/claims/claim-1/file-1.pdf');
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

  it('rejects mismatched evidence buckets', () => {
    expectInvalidAssignedStoragePath('pii/tenants/tenant-1/claims/claim-1/file-1.pdf', {
      bucket: 'policy-documents',
    });
  });

  it('normalizes unicode and whitespace filenames while rejecting slash injection', () => {
    const storagePath = buildEvidenceStoragePath({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: 'file-1',
      fileName: '  Resume 😄 final.pdf  ',
      shape: 'initial',
      tenantId: 'tenant-1',
    });

    expect(storagePath).toBe(
      'pii/tenants/tenant-1/claims/member-1/unassigned/file-1-Resume_final.pdf'
    );
    expect(
      buildEvidenceStoragePath({
        actorId: 'member-1',
        bucket: 'claim-evidence',
        fileId: 'file-2',
        fileName: '  фактура.pdf  ',
        shape: 'initial',
        tenantId: 'tenant-1',
      })
    ).toBe('pii/tenants/tenant-1/claims/member-1/unassigned/file-2-file.pdf');
    expect(() =>
      buildEvidenceStoragePath({
        actorId: 'member-1',
        bucket: 'claim-evidence',
        fileId: 'file-1',
        fileName: 'folder/receipt.pdf',
        shape: 'initial',
        tenantId: 'tenant-1',
      })
    ).toThrow(/Invalid evidence storage path/);
  });

  it('pins initial token verification to the centralized path invariant', () => {
    const malformedPath =
      'pii/tenants/tenant-1/claims/member-1/unassigned/file-1-receipt.pdf/extra';
    const intentToken = createInitialClaimUploadIntentToken({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: 'file-1',
      fileSize: 1024,
      mimeType: 'application/pdf',
      storagePath: malformedPath,
      tenantId: 'tenant-1',
    });

    expect(
      verifyInitialClaimUploadIntentToken({
        actorId: 'member-1',
        bucket: 'claim-evidence',
        fileId: 'file-1',
        fileSize: 1024,
        intentToken,
        mimeType: 'application/pdf',
        storagePath: malformedPath,
        tenantId: 'tenant-1',
      })
    ).toEqual({ success: false, error: 'Upload confirmation expired. Please retry upload.' });
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
