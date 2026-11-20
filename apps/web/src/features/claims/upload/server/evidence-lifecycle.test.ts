import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, expect, it, vi } from 'vitest';
import { getReplayFixture } from './claim-document-write-replay-fixture';
import { persistClaimDocumentMetadata } from './claim-document-write';
import { validateConfirmedClaimUpload, createClaimUploadIntentToken } from './shared-upload';
import { validateEvidenceContent } from './validate-evidence-content';
import { EVIDENCE_FORMATS } from '../evidence-file-policy';

const m = vi.hoisted(() => ({ prefix: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/storage/object-prefix', () => ({ readTenantObjectPrefix: m.prefix }));
vi.mock('@/lib/storage/service-role', () => ({
  usesDeterministicE2EStorage: () => false,
  removeTenantObject: m.remove,
  listTenantObjectsForSingleFile: m.list,
}));
const fake = getReplayFixture();
const authority = mintTestTenantAuthority('tenant-1');
const doc = {
  authority,
  actorRole: 'member',
  expectedClaimOwnerId: 'member-1',
  category: 'evidence' as const,
  claimId: 'claim-1',
  fileId: 'file-1',
  fileSize: 1024,
  logPrefix: '[test]',
  mimeType: 'application/pdf',
  originalName: 'file.pdf',
  resolvedBucket: 'claim-evidence',
  storagePath: 'pii/tenants/tenant-1/claims/claim-1/file-1.pdf',
  tenantId: 'tenant-1',
  userId: 'member-1',
};
const context = {
  authority,
  bucket: doc.resolvedBucket,
  storagePath: doc.storagePath,
  tenantId: doc.tenantId,
  format: EVIDENCE_FORMATS[0],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
  fake.state.committed = {
    claims: [{ id: doc.claimId, tenantId: doc.tenantId, userId: doc.userId }],
  };
  fake.state.tail = Promise.resolve();
  fake.state.faults.selectTable = null;
  fake.state.faults.insertTable = null;
  m.prefix.mockResolvedValue(new TextEncoder().encode('%PDF-1.7'));
  m.remove.mockResolvedValue({ error: null });
  m.list.mockResolvedValue({
    data: [{ name: 'file-1.pdf', metadata: { size: 1024, mimetype: doc.mimeType } }],
    error: null,
  });
});

it('confirms then replays without reading, deleting, or persisting the object again', async () => {
  const intent = { actorId: doc.userId, bucket: doc.resolvedBucket, ...doc };
  const confirmation = { ...doc, uploadIntentToken: createClaimUploadIntentToken(intent) };
  const args = {
    authority,
    actorId: doc.userId,
    bucket: doc.resolvedBucket,
    tenantId: doc.tenantId,
    logPrefix: '[test]',
    confirmation,
  };
  expect(await validateConfirmedClaimUpload(args)).toEqual({ success: true });
  expect(await persistClaimDocumentMetadata(doc)).toBe(true);
  m.prefix.mockRejectedValue(new Error('Storage no longer reachable'));
  expect(await validateConfirmedClaimUpload(args)).toMatchObject({ success: true, replayed: true });
  expect(m.prefix).toHaveBeenCalledOnce();
  expect(m.remove).not.toHaveBeenCalled();
  expect(fake.state.committed.claim_documents).toHaveLength(1);
});

it('never deletes mismatched bytes referenced by a persisted row', async () => {
  await persistClaimDocumentMetadata(doc);
  m.prefix.mockResolvedValue(new Uint8Array([1, 2, 3]));
  expect(await validateEvidenceContent(context)).toMatchObject({
    success: false,
    error: 'evidence_content_mismatch',
  });
  expect(m.remove).not.toHaveBeenCalled();
});

it('preserves evidence persisted while a mismatched prefix read is in flight', async () => {
  m.prefix.mockImplementationOnce(async () => {
    await persistClaimDocumentMetadata(doc);
    return new Uint8Array([1, 2, 3]);
  });
  expect(await validateEvidenceContent(context)).toMatchObject({
    success: false,
    error: 'evidence_content_mismatch',
  });
  expect(m.remove).not.toHaveBeenCalled();
});

it('refuses mismatches even with unreadable references and fails closed on tenant mismatch', async () => {
  m.prefix.mockResolvedValue(new Uint8Array([1, 2, 3]));
  fake.state.faults.selectTable = 'claim_documents';
  expect(await validateEvidenceContent(context)).toMatchObject({
    success: false,
    error: 'evidence_content_mismatch',
    status: 409,
  });
  fake.state.faults.selectTable = null;
  expect(
    await validateEvidenceContent({ ...context, authority: mintTestTenantAuthority('tenant-2') })
  ).toMatchObject({ success: false });
  expect(m.remove).not.toHaveBeenCalled();
});

it.each([{ tenantId: 'tenant-2' }, { bucket: 'other-bucket' }, { filePath: 'another/path.pdf' }])(
  'never deletes mismatches regardless of unrelated references: %j',
  async changed => {
    fake.state.committed.claim_documents = [
      {
        id: 'other-document',
        tenantId: doc.tenantId,
        bucket: doc.resolvedBucket,
        filePath: doc.storagePath,
        ...changed,
      },
    ];
    m.prefix.mockResolvedValue(new Uint8Array([1, 2, 3]));
    expect(await validateEvidenceContent(context)).toMatchObject({
      success: false,
      error: 'evidence_content_mismatch',
    });
    expect(m.remove).not.toHaveBeenCalled();
  }
);

it.each(['before re-upload', 'after persistence'])(
  'preserves valid re-uploaded bytes when the second rejection finishes %s',
  async timing => {
    let object: Uint8Array | null = new Uint8Array([1, 2, 3]);
    const invalidSnapshot = object;
    let resumeSecond!: () => void;
    const secondRead = new Promise<void>(resolve => {
      resumeSecond = resolve;
    });
    m.prefix.mockImplementationOnce(() => Promise.resolve(invalidSnapshot));
    m.prefix.mockImplementationOnce(() => secondRead.then(() => invalidSnapshot));
    m.remove.mockImplementation(() => {
      object = null;
      return Promise.resolve({ error: null });
    });

    const first = validateEvidenceContent(context);
    const second = validateEvidenceContent(context);
    const mismatch = { success: false, error: 'evidence_content_mismatch', status: 409 };
    expect(await first).toEqual(mismatch);
    if (timing === 'before re-upload') {
      resumeSecond();
      expect(await second).toEqual(mismatch);
    }
    expect(fake.state.committed.claim_documents ?? []).toHaveLength(0);
    // Model the still-valid token recreating the same path with valid bytes.
    object = new TextEncoder().encode('%PDF-1.7');
    m.prefix.mockImplementationOnce(() => Promise.resolve(object));
    expect(await validateEvidenceContent(context)).toEqual({ success: true });
    expect(await persistClaimDocumentMetadata(doc)).toBe(true);
    resumeSecond();
    expect(await second).toEqual(mismatch);
    expect(m.remove).not.toHaveBeenCalled();
    expect(object).toEqual(new TextEncoder().encode('%PDF-1.7'));
    expect(fake.state.committed.claim_documents).toHaveLength(1);
  }
);
