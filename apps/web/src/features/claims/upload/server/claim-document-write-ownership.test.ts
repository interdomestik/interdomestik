import { getReplayFixture } from './claim-document-write-replay-fixture';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ClaimDocumentUploadConflictError,
  persistClaimDocumentMetadata,
} from './claim-document-write';

const fake = getReplayFixture();
const params = {
  actorRole: 'member',
  expectedClaimOwnerId: 'member-1',
  userId: 'member-1',
  tenantId: 'tenant-1',
  claimId: 'claim-1',
  fileId: 'doc-1',
  category: 'evidence' as const,
  fileSize: 20,
  logPrefix: '[synthetic]',
  mimeType: 'application/pdf',
  originalName: 'evidence.pdf',
  resolvedBucket: 'claim-evidence',
  storagePath: 'synthetic/doc-1.pdf',
};
beforeEach(() => {
  fake.state.committed = { claims: [{ id: 'claim-1', tenantId: 'tenant-1', userId: 'member-1' }] };
  fake.state.contexts.length = 0;
  fake.state.faults.insertTable = null;
  fake.state.faults.selectTable = null;
  fake.state.reads.length = 0;
  fake.state.tail = Promise.resolve();
});

describe('ordinary member-surface write-time ownership', () => {
  it('rechecks the trusted owner in the metadata transaction while retaining an admin actor', async () => {
    expect(await persistClaimDocumentMetadata({ ...params, actorRole: 'admin' })).toBe(true);
    expect(fake.state.contexts).toEqual([{ tenantId: 'tenant-1', role: 'admin' }]);
    expect(fake.state.committed.claim_documents).toHaveLength(1);
    expect(fake.state.reads[0]?.table).toBe('claims');
  });

  it.each(['other-member', undefined])(
    'rejects postlookup owner revocation or disappearance: %s',
    async owner => {
      // Models the state AFTER a separate successful ownership lookup and BEFORE persistence.
      fake.state.committed.claims = owner
        ? [{ id: 'claim-1', tenantId: 'tenant-1', userId: owner }]
        : [];
      await expect(persistClaimDocumentMetadata(params)).rejects.toBeInstanceOf(
        ClaimDocumentUploadConflictError
      );
      expect(fake.state.committed.claim_documents).toBeUndefined();
    }
  );

  it('does not accept an expected owner that differs from the trusted uploader', async () => {
    await expect(
      persistClaimDocumentMetadata({ ...params, expectedClaimOwnerId: 'other-member' })
    ).rejects.toBeInstanceOf(ClaimDocumentUploadConflictError);
    expect(fake.state.committed.claim_documents).toBeUndefined();
  });

  it('keeps the admin upload surface contract when no member-owner expectation is supplied', async () => {
    expect(
      await persistClaimDocumentMetadata({
        ...params,
        actorRole: 'admin',
        expectedClaimOwnerId: undefined,
        userId: 'admin-1',
      })
    ).toBe(true);
    expect(fake.state.reads).toEqual([]);
  });
});
