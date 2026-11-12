import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, expect, it, vi } from 'vitest';
import { validateInitialClaimEvidenceUpload } from './initial-claim-evidence-validation';
import { buildEvidenceStoragePath } from './storage-path';
import { createInitialClaimUploadIntentToken } from './initial-claim-upload';

const m = vi.hoisted(() => ({
  list: vi.fn(),
  prefix: vi.fn(),
  remove: vi.fn(),
  referenced: vi.fn(),
}));
vi.mock('@/lib/storage/service-role', () => ({
  listTenantObjectsForSingleFile: m.list,
  removeTenantObject: m.remove,
  usesDeterministicE2EStorage: () => false,
}));
vi.mock('@/lib/storage/object-prefix', () => ({ readTenantObjectPrefix: m.prefix }));
vi.mock('./persisted-evidence', async importOriginal => ({
  ...(await importOriginal<typeof import('./persisted-evidence')>()),
  hasPersistedEvidenceReference: m.referenced,
}));
const authority = mintTestTenantAuthority('tenant-1');

function evidence(ext = 'pdf', type = 'application/pdf', size = 100) {
  const file = {
    id: 'file-1',
    name: `proof.${ext}`,
    type,
    size,
    bucket: 'claim-evidence',
    category: 'evidence' as const,
    classification: 'pii',
    path: buildEvidenceStoragePath({
      actorId: 'member-1',
      bucket: 'claim-evidence',
      fileId: 'file-1',
      fileName: `proof.${ext}`,
      shape: 'initial',
      tenantId: 'tenant-1',
    }),
  };
  const uploadIntentToken = createInitialClaimUploadIntentToken({
    actorId: 'member-1',
    bucket: file.bucket,
    fileId: file.id,
    fileSize: size,
    mimeType: type,
    storagePath: file.path,
    tenantId: 'tenant-1',
  });
  m.list.mockResolvedValue({
    data: [{ name: `file-1-proof.${ext}`, metadata: { size, mimetype: type } }],
    error: null,
  });
  return {
    authority,
    actorId: 'member-1',
    expectedBucket: file.bucket,
    tenantId: 'tenant-1',
    file: { ...file, uploadIntentToken },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
  m.remove.mockResolvedValue({ error: null });
  m.referenced.mockResolvedValue(false);
});

it.each([
  ['heic', 'image/heic', 100, [0, 0, 0, 16, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0]],
  [
    'docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    100,
    [0x50, 0x4b, 3, 4],
  ],
  [
    'mp4',
    'video/mp4',
    50 * 1024 * 1024,
    [0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0],
  ],
] as const)(
  'validates initial .%s metadata and bytes with the shared policy',
  async (ext, type, size, prefix) => {
    m.prefix.mockResolvedValue(new Uint8Array(prefix));
    await expect(
      validateInitialClaimEvidenceUpload(evidence(ext, type, size))
    ).resolves.toBeUndefined();
    expect(m.prefix).toHaveBeenCalledOnce();
    expect(m.remove).not.toHaveBeenCalled();
  }
);

it('rejects and cleans up a spoofed initial PDF', async () => {
  m.prefix.mockResolvedValue(new TextEncoder().encode('renamed text'));
  await expect(validateInitialClaimEvidenceUpload(evidence())).rejects.toThrow(
    'evidence_content_mismatch'
  );
  expect(m.remove).toHaveBeenCalledOnce();
});

it('never deletes initial evidence referenced by a persisted document', async () => {
  m.prefix.mockResolvedValue(new TextEncoder().encode('renamed text'));
  m.referenced.mockResolvedValue(true);
  await expect(validateInitialClaimEvidenceUpload(evidence())).rejects.toThrow(
    'evidence_content_mismatch'
  );
  expect(m.remove).not.toHaveBeenCalled();
});

it.each([
  ['txt', 'text/plain', 100, 'evidence_unsupported'],
  ['mp4', 'video/mp4', 50 * 1024 * 1024 + 1, 'evidence_too_large'],
  ['pdf', 'application/pdf', 0, 'evidence_empty'],
] as const)(
  'refuses initial .%s size %s/%s before storage access',
  async (ext, mime, size, error) => {
    await expect(validateInitialClaimEvidenceUpload(evidence(ext, mime, size))).rejects.toThrow(
      error
    );
    expect(m.list).not.toHaveBeenCalled();
    expect(m.prefix).not.toHaveBeenCalled();
  }
);

it('retains the stored size check and fails closed on tenant authority mismatch', async () => {
  const args = evidence();
  m.list.mockResolvedValue({
    data: [{ name: 'file-1-proof.pdf', metadata: { size: 101, mimetype: 'application/pdf' } }],
    error: null,
  });
  await expect(validateInitialClaimEvidenceUpload(args)).rejects.toThrow('metadata mismatch');
  await expect(
    validateInitialClaimEvidenceUpload({ ...args, authority: mintTestTenantAuthority('tenant-2') })
  ).rejects.toThrow('tenant authority mismatch');
  expect(m.prefix).not.toHaveBeenCalled();
  expect(m.remove).not.toHaveBeenCalled();
});
