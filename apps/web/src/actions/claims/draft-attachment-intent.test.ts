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

  it('refuses a claim-bound token at the initial-intent verifier, on a prefix-valid path', async () => {
    const file = initialFile();
    // Same actor, tenant, bucket, file and path: only the token kind (claim-bound) differs.
    const uploadIntentToken = createClaimUploadIntentToken({
      actorId: MEMBER,
      bucket: BUCKET,
      claimId: OTHER_CLAIM,
      fileId: file.id,
      fileSize: file.size,
      mimeType: file.type,
      storagePath: file.path,
      tenantId: TENANT,
    });

    await expect(update([{ ...file, uploadIntentToken }])).resolves.toEqual({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
      code: 'INVALID_PATH',
    });
    expect(db.storage.list).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it('answers an unverified file the same whether or not another case holds its path', async () => {
    const file = initialFile({ tokenSize: 101 });
    const unattached = await update([file]);
    db.documents = [{ bucket: BUCKET, claimId: OTHER_CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toEqual(unattached);
    expect(unattached).toMatchObject({
      success: false,
      error: 'Upload confirmation expired. Please retry upload.',
    });
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

  it('answers a former owner the same whether or not the draft holds the path', async () => {
    // The draft changes hands after the ownership check: the joined read and the update see it.
    const file = withoutToken(initialFile());
    db.callerOwnsAtRead = false;
    db.updateMatches = false;
    const absent = await update([file]);
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toEqual(absent);
    expect(absent).toMatchObject({ success: false, code: 'INVALID_PATH' });
    expectNothingWritten();
  });

  it('rolls back with a conflict when a no-op row moved to another claim before the write', async () => {
    const file = withoutToken(initialFile());
    db.nextReads = [
      [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }],
      [{ bucket: BUCKET, claimId: OTHER_CLAIM, filePath: file.path }],
    ];

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
