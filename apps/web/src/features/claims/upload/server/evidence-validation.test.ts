import { zipFixture } from '../../../../../../../packages/domain-claims/src/test/evidence-container-fixtures';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEvidenceStoragePath } from './storage-path';
import {
  createClaimUploadIntentToken,
  createSignedUploadUrl,
  validateConfirmedClaimUpload,
} from './shared-upload';

const m = vi.hoisted(() => ({
  sign: vi.fn(),
  list: vi.fn(),
  prefix: vi.fn(),
  tail: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/storage/service-role', () => ({
  createTenantSignedUploadUrl: m.sign,
  listTenantObjectsForSingleFile: m.list,
  removeTenantObject: m.remove,
  usesDeterministicE2EStorage: () => false,
}));
vi.mock('@/lib/storage/object-prefix', () => ({
  readTenantObjectPrefix: m.prefix,
  readTenantObjectTail: m.tail,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('./persisted-evidence', () => ({
  assertEvidenceTenantAuthority: vi.fn(),
}));
vi.mock('./claim-document-replay', () => ({
  isPersistedClaimDocumentReplay: vi.fn().mockResolvedValue(false),
}));

const MB = 1024 * 1024;
const context = {
  authority: mintTestTenantAuthority('tenant-1'),
  actorId: 'member-1',
  bucket: 'claim-evidence',
  tenantId: 'tenant-1',
  logPrefix: '[test]',
};

function confirmation(ext = 'pdf', mimeType = 'application/pdf', fileSize = 1024) {
  const fields = {
    ...context,
    claimId: 'claim-1',
    fileId: 'file-1',
    fileSize,
    mimeType,
    storagePath: buildEvidenceStoragePath({
      bucket: context.bucket,
      tenantId: context.tenantId,
      claimId: 'claim-1',
      fileId: 'file-1',
      fileName: `evidence.${ext}`,
      shape: 'assigned',
    }),
  };
  return {
    ...fields,
    originalName: `evidence.${ext}`,
    uploadIntentToken: createClaimUploadIntentToken(fields),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-secret-value-123456789');
  m.sign.mockResolvedValue({
    data: { signedUrl: 'https://storage.test/upload', token: 'signed' },
    error: null,
  });
  m.list.mockResolvedValue({
    data: [{ name: 'file-1.pdf', metadata: { size: 1024, mimetype: 'application/pdf' } }],
    error: null,
  });
  m.prefix.mockResolvedValue(new TextEncoder().encode('%PDF-1.7'));
  m.remove.mockResolvedValue({ error: null });
});

describe('signed evidence URL validation', () => {
  it('returns a generic failure without retrying non-transient provider errors', async () => {
    m.sign.mockResolvedValueOnce({
      data: null,
      error: { message: 'mime type application/pdf is not supported' },
    });
    expect(
      await createSignedUploadUrl({
        ...context,
        claimId: 'claim-1',
        fileName: 'file.pdf',
        fileSize: 100,
        mimeType: 'application/pdf',
      })
    ).toEqual({ success: false, error: 'evidence_upload_failed', status: 500 });
    expect(m.sign).toHaveBeenCalledOnce();
  });
  it.each([
    ['txt', 'text/plain', 100, 'evidence_unsupported', 400],
    ['webm', 'video/webm', 100, 'evidence_unsupported', 400],
    ['pdf', 'application/pdf', 0, 'evidence_empty', 400],
    ['pdf', 'application/pdf', 10 * MB + 1, 'evidence_too_large', 413],
    ['mp3', 'audio/mpeg', 10 * MB + 1, 'evidence_too_large', 413],
    ['mov', 'video/quicktime', 50 * MB + 1, 'evidence_too_large', 413],
    ['pdf', 'text/plain', 100, 'evidence_unsupported', 400],
  ])('refuses .%s / %s / %s before signing', async (ext, mimeType, fileSize, error, status) => {
    expect(
      await createSignedUploadUrl({
        ...context,
        claimId: 'claim-1',
        fileName: `file.${ext}`,
        fileSize,
        mimeType,
      })
    ).toMatchObject({ success: false, error, status });
    expect(m.sign).not.toHaveBeenCalled();
  });

  it('refuses a storage MIME override instead of signing a text/plain fallback', async () => {
    expect(
      await createSignedUploadUrl({
        ...context,
        claimId: 'claim-1',
        fileName: 'file.doc',
        fileSize: 100,
        mimeType: 'application/msword',
        storageContentType: 'text/plain',
      })
    ).toMatchObject({ success: false, error: 'evidence_unsupported' });
    expect(m.sign).not.toHaveBeenCalled();
  });

  it('signs 50 MB video and 10 MB documents with canonical MIME bound in the intent', async () => {
    for (const [ext, mimeType, fileSize] of [
      ['mp4', 'video/mp4', 50 * MB],
      ['pdf', 'application/pdf', 10 * MB],
    ] as const) {
      expect(
        await createSignedUploadUrl({
          ...context,
          claimId: 'claim-1',
          fileName: `file.${ext}`,
          fileSize,
          mimeType,
        })
      ).toMatchObject({ success: true });
    }
    expect(m.sign).toHaveBeenCalledTimes(2);
    expect(m.sign).toHaveBeenCalledWith(expect.objectContaining({ upsert: false }));
  });
});

describe('confirmation content and size validation', () => {
  it('accepts verified metadata and signature', async () => {
    expect(
      await validateConfirmedClaimUpload({ ...context, confirmation: confirmation() })
    ).toEqual({ success: true });
    expect(m.prefix).toHaveBeenCalledWith(
      expect.objectContaining({
        family: 'claims',
        tenantId: 'tenant-1',
        path: 'pii/tenants/tenant-1/claims/claim-1/file-1.pdf',
      })
    );
    expect(m.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['txt', 'text/plain', 100, 'evidence_unsupported'],
    ['pdf', 'application/pdf', 0, 'evidence_empty'],
    ['png', 'image/png', 10 * MB + 1, 'evidence_too_large'],
    ['mp4', 'video/mp4', 50 * MB + 1, 'evidence_too_large'],
  ])('refuses confirmed .%s size %s/%s before reading storage', async (ext, mime, size, error) => {
    expect(
      await validateConfirmedClaimUpload({
        ...context,
        confirmation: confirmation(ext, mime, size),
      })
    ).toMatchObject({ success: false, error });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.prefix).not.toHaveBeenCalled();
  });

  it('refuses spoofed content without deleting the private object', async () => {
    m.prefix.mockResolvedValue(new TextEncoder().encode('text renamed.pdf'));
    expect(
      await validateConfirmedClaimUpload({ ...context, confirmation: confirmation() })
    ).toEqual({ success: false, error: 'evidence_content_mismatch', status: 409 });
    expect(m.remove).not.toHaveBeenCalled();
  });

  it('fails closed if the prefix cannot be read and never invokes cleanup', async () => {
    m.prefix.mockRejectedValueOnce(new Error('provider secret detail'));
    expect(
      await validateConfirmedClaimUpload({ ...context, confirmation: confirmation() })
    ).toMatchObject({ success: false, error: 'evidence_upload_failed' });
    expect(m.remove).not.toHaveBeenCalled();
    m.prefix.mockResolvedValue(new TextEncoder().encode('spoof'));
    m.remove.mockRejectedValueOnce(new Error('cleanup must never run'));
    expect(
      await validateConfirmedClaimUpload({ ...context, confirmation: confirmation() })
    ).toMatchObject({ success: false, error: 'evidence_content_mismatch', status: 409 });
    expect(m.remove).not.toHaveBeenCalled();
  });

  it('preserves intent, tenant, stored MIME and actual size checks before content validation', async () => {
    const original = confirmation();
    for (const change of [
      { uploadIntentToken: 'forged' },
      { fileSize: 2048 },
      { storageContentType: 'text/plain' },
      { storagePath: 'pii/tenants/tenant-2/claims/claim-1/file-1.pdf' },
    ]) {
      expect(
        await validateConfirmedClaimUpload({ ...context, confirmation: { ...original, ...change } })
      ).toMatchObject({ success: false });
    }
    m.list.mockResolvedValueOnce({
      data: [{ name: 'file-1.pdf', metadata: { size: 11 * MB, mimetype: 'application/pdf' } }],
      error: null,
    });
    expect(
      await validateConfirmedClaimUpload({ ...context, confirmation: original })
    ).toMatchObject({ success: false });
    expect(m.prefix).not.toHaveBeenCalled();
    expect(m.remove).not.toHaveBeenCalled();
  });
});

it.each([
  [
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'word/document.xml',
    'xl/workbook.xml',
  ],
  [
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xl/workbook.xml',
    'word/document.xml',
  ],
])(
  'confirms OOXML .%s using bounded directory evidence and rejects cross-swaps',
  async (ext, mime, part, otherPart) => {
    const bytes = zipFixture(['[Content_Types].xml', part]);
    m.prefix.mockResolvedValue(bytes.subarray(0, 256));
    m.tail.mockResolvedValue({ bytes, offset: 0 });
    m.list.mockResolvedValue({
      data: [{ name: `file-1.${ext}`, metadata: { size: 1024, mimetype: mime } }],
      error: null,
    });
    const args = { ...context, confirmation: confirmation(ext, mime) };
    expect(await validateConfirmedClaimUpload(args)).toEqual({ success: true });
    expect(m.tail).toHaveBeenCalledWith(
      expect.objectContaining({ family: 'claims', tenantId: 'tenant-1' })
    );
    m.tail.mockResolvedValue({ bytes: zipFixture(['[Content_Types].xml', otherPart]), offset: 0 });
    expect(await validateConfirmedClaimUpload(args)).toEqual({
      success: false,
      error: 'evidence_content_mismatch',
      status: 409,
    });
    m.tail.mockRejectedValueOnce(new Error('range unavailable'));
    expect(await validateConfirmedClaimUpload(args)).toEqual({
      success: false,
      error: 'evidence_upload_failed',
      status: 500,
    });
    expect(m.remove).not.toHaveBeenCalled();
  }
);
