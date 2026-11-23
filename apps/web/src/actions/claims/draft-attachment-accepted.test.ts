import './draft-attachment-intent.mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  actAsOwnerWithRole,
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

describe('updateDraftClaim attachments — accepted', () => {
  it('attaches a file with a valid intent, with server-derived tenant, claim and uploader', async () => {
    const file = initialFile();

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.updatedClaims).toBe(1);
    expect(db.inserted).toEqual([
      expect.objectContaining({
        tenantId: TENANT,
        claimId: CLAIM,
        uploadedBy: MEMBER,
        filePath: file.path,
        bucket: BUCKET,
      }),
    ]);
  });

  it('locks the new object inside the write transaction', async () => {
    const file = initialFile();

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.locks).toEqual([
      {
        objects: [expect.objectContaining({ bucket: BUCKET, path: file.path })],
        tenantId: TENANT,
        txId: db.writeTxId,
      },
    ]);
    expect(db.writeTxId).toBeGreaterThan(0);
  });

  it('locks and row-locks a re-sent file of this draft, and does not insert it again', async () => {
    const file = initialFile();
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.locks).toEqual([
      {
        objects: [expect.objectContaining({ path: file.path })],
        tenantId: TENANT,
        txId: db.writeTxId,
      },
    ]);
    expect(db.rowLocks).toEqual(['share']);
    expect(db.inserted).toHaveLength(0);
  });

  it('ignores identity fields injected into a file entry', async () => {
    const file = {
      ...initialFile(),
      tenantId: 'tenant-2',
      claimId: OTHER_CLAIM,
      uploadedBy: OTHER_MEMBER,
    };

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.inserted).toEqual([
      expect.objectContaining({ tenantId: TENANT, claimId: CLAIM, uploadedBy: MEMBER }),
    ]);
  });

  it('lets a read-only owner edit text without files, and refuses its re-send of a file', async () => {
    actAsOwnerWithRole('auditor');
    await expect(update([])).resolves.toEqual({ success: true });

    const file = withoutToken(initialFile());
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];
    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expect(db.updatedClaims).toBe(1);
    expect(db.inserted).toHaveLength(0);
  });

  it('verifies a re-sent file of this draft like a new one: refused without a valid intent', async () => {
    const file = withoutToken(initialFile());
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toMatchObject({ success: false, code: 'INVALID_PATH' });
    expect(db.updatedClaims).toBe(0);
    expect(db.inserted).toHaveLength(0);
  });

  it('with a padded bucket variable, accepts an intent signed for the trimmed bucket (as /api/uploads signs it)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', ` ${BUCKET} `);
    const file = initialFile();

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.inserted).toEqual([expect.objectContaining({ bucket: BUCKET })]);
  });

  it('reports a post-commit audit failure as a failure; the retry is a no-op for the file', async () => {
    const { logAuditEvent } = await import('@/lib/audit');
    vi.mocked(logAuditEvent).mockRejectedValueOnce(new Error('audit down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = initialFile();

    await expect(update([file])).resolves.toEqual({
      success: false,
      error: 'Failed to update claim',
    });
    // The transaction committed before the audit call: fields and the row are durable.
    expect(db.updatedClaims).toBe(1);
    expect(db.inserted).toHaveLength(1);

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.inserted).toHaveLength(1);
  });

  it('does not insert twice when the same update is replayed', async () => {
    const file = initialFile();

    await expect(update([file])).resolves.toEqual({ success: true });
    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.inserted).toHaveLength(1);
  });
});
