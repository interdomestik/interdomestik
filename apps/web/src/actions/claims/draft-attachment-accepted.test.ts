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

  it('lets a read-only owner edit text and re-send an attached file', async () => {
    actAsOwnerWithRole('auditor');
    const file = withoutToken(initialFile());
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.inserted).toHaveLength(0);
  });

  it('treats a re-sent file of this claim as a no-op, even with an expired or missing token', async () => {
    const file = withoutToken(initialFile());
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: file.path }];

    await expect(update([file])).resolves.toEqual({ success: true });
    expect(db.updatedClaims).toBe(1);
    expect(db.inserted).toHaveLength(0);
    expect(db.storage.list).not.toHaveBeenCalled();
  });

  it('inserts only the new file when an existing one is re-sent with it', async () => {
    const existing = withoutToken(initialFile({ fileId: 'file-0' }));
    db.documents = [{ bucket: BUCKET, claimId: CLAIM, filePath: existing.path }];
    const fresh = initialFile();

    await expect(update([existing, fresh])).resolves.toEqual({ success: true });
    expect(db.inserted).toEqual([expect.objectContaining({ filePath: fresh.path })]);
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
