import './draft-attachment-intent.mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createClaimUploadIntentToken } from '@/features/claims/upload/server/claim-upload-intent';
import { buildEvidenceStoragePath } from '@/features/claims/upload/server/storage-path';

import {
  actAsOwnerWithRole,
  expectNothingWritten,
  initialFile,
  resetDraftAttachmentFixture,
  update,
  withoutToken,
} from './draft-attachment-intent.fixture';
import {
  BUCKET,
  CLAIM,
  db,
  MEMBER,
  OTHER_CLAIM,
  OTHER_MEMBER,
  TENANT,
} from './draft-attachment-intent.state';

beforeEach(() => {
  resetDraftAttachmentFixture();
});

describe('updateDraftClaim attachments — refused without a verified upload intent', () => {
  it('refuses the path of another case of the same tenant', async () => {
    const victimPath = buildEvidenceStoragePath({
      bucket: BUCKET,
      claimId: OTHER_CLAIM,
      fileId: 'victim-file',
      fileName: 'medical.pdf',
      shape: 'assigned',
      tenantId: TENANT,
    });
    const file = { ...initialFile(), path: victimPath };

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses another member’s initial upload, even with that member’s token', async () => {
    const file = initialFile({ actorId: OTHER_MEMBER });

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses a wrong bucket', async () => {
    const file = initialFile({ bucket: 'public-assets' });

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_BUCKET' });
    expectNothingWritten();
  });

  it('refuses a missing token', async () => {
    const file = withoutToken(initialFile());

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses an own path signed for another user', async () => {
    const file = initialFile({ tokenActorId: OTHER_MEMBER });

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses a claim-bound token minted for another claim', async () => {
    const path = buildEvidenceStoragePath({
      bucket: BUCKET,
      claimId: OTHER_CLAIM,
      fileId: 'file-1',
      fileName: 'proof.pdf',
      shape: 'assigned',
      tenantId: TENANT,
    });
    const uploadIntentToken = createClaimUploadIntentToken({
      actorId: MEMBER,
      bucket: BUCKET,
      claimId: OTHER_CLAIM,
      fileId: 'file-1',
      fileSize: 100,
      mimeType: 'application/pdf',
      storagePath: path,
      tenantId: TENANT,
    });
    const file = { ...initialFile(), path, uploadIntentToken };

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses an own initial upload already attached to another claim', async () => {
    const file = initialFile();
    db.documents = [{ bucket: BUCKET, claimId: OTHER_CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses a token for another tenant', async () => {
    const file = initialFile({ tokenTenantId: 'tenant-2' });

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses another tenant’s object', async () => {
    const file = initialFile({ tenantId: 'tenant-2' });

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses an expired token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-22T10:00:00Z'));
    const file = initialFile();
    vi.setSystemTime(new Date('2026-11-22T10:16:00Z'));

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses a token whose signed size differs from the sent file', async () => {
    const file = initialFile({ tokenSize: 101 });

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses a token with a forged signature and otherwise matching metadata', async () => {
    const file = initialFile();
    const [payload] = file.uploadIntentToken.split('.');
    const forged = { ...file, uploadIntentToken: `${payload}.${'A'.repeat(43)}` };

    await expect(update([forged])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('refuses the same object twice in one payload', async () => {
    const file = initialFile();

    await expect(update([file, file])).resolves.toMatchObject({
      success: false,
      code: 'INVALID_PAYLOAD',
    });
    expectNothingWritten();
  });

  it('refuses the whole update when one of several files is unverified', async () => {
    const good = initialFile();
    const bad = withoutToken(initialFile({ fileId: 'file-2' }));

    await expect(update([good, bad])).resolves.toMatchObject({ success: false });
    expectNothingWritten();
  });

  it('refuses when the stored object is missing', async () => {
    db.storage.list.mockResolvedValue({ data: [], error: null });

    await expect(update([initialFile()])).resolves.toMatchObject({
      success: false,
      code: 'INVALID_PATH',
    });
    expectNothingWritten();
  });

  it('refuses when the stored object’s size differs from the signed size', async () => {
    db.storage.list.mockResolvedValue({
      data: [{ name: 'file-1-proof.pdf', metadata: { size: 999, mimetype: 'application/pdf' } }],
      error: null,
    });

    await expect(update([initialFile()])).resolves.toMatchObject({
      success: false,
      code: 'INVALID_PATH',
    });
    expectNothingWritten();
  });

  it('refuses a new file from a read-only owner of the draft', async () => {
    actAsOwnerWithRole('auditor');

    await expect(update([initialFile()])).resolves.toMatchObject({
      success: false,
      code: 'INVALID_PATH',
    });
    expectNothingWritten();
  });

  it('rolls back with a conflict when a no-op row vanished before the write', async () => {
    const file = withoutToken(initialFile());
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];
    db.nextReads = [[...db.documents], []];

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'CONFLICT' });
    expectNothingWritten();
  });

  it('rolls back when another claim attached the object between verification and write', async () => {
    const file = initialFile();
    db.nextReads = [[], [{ bucket: BUCKET, claimId: OTHER_CLAIM, filePath: file.path }]];

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('returns a conflict and writes nothing when the draft changed meanwhile', async () => {
    db.updateMatches = false;

    await expect(update([initialFile()])).resolves.toEqual({
      success: false,
      error: 'Claim changed. Refresh and retry.',
      code: 'CONFLICT',
    });
    expectNothingWritten();
  });
});
