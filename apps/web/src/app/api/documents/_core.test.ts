import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentAccessDeps, getDocumentAccessCore } from './_core';

const mockDb = {
  select: vi.fn(),
} as any;

const mockStorage = {
  createSignedUrl: vi.fn(),
  download: vi.fn(),
};

const mockDeps: DocumentAccessDeps = {
  db: mockDb,
  storage: mockStorage,
};

const memberSession = { user: { id: 'member-1', role: 'member', tenantId: 't1' } };
const otherMemberSession = { user: { id: 'member-2', role: 'member', tenantId: 't1' } };
const branchManagerSession = {
  user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
} as const;

const branchScopedClaimRow = {
  claimOwnerId: 'member-1',
  claimBranchId: 'branch-a',
  claimStaffId: 'staff-2',
};

const memberPolymorphicDocument = {
  id: 'doc-profile',
  entityType: 'member',
  entityId: 'member-1',
  storagePath: 'path/to/profile',
  uploadedBy: 'staff-1',
  fileName: 'id.pdf',
  mimeType: 'application/pdf',
  fileSize: 100,
  tenantId: 't1',
};

const claimScopedPolymorphicDocument = {
  id: 'doc1',
  entityType: 'claim',
  entityId: 'claim-1',
  storagePath: 'path',
  uploadedBy: 'other',
  fileName: 'evidence.pdf',
  mimeType: 'application/pdf',
  fileSize: 123,
  tenantId: 't1',
};

const policyPolymorphicDocument = {
  id: 'doc-policy',
  entityType: 'policy',
  entityId: 'policy-1',
  storagePath: 'path/to/policy',
  uploadedBy: 'staff-1',
  fileName: 'policy.pdf',
  mimeType: 'application/pdf',
  fileSize: 200,
  tenantId: 't1',
};

const legacyDocument = {
  id: 'doc1',
  claimId: 'claim-1',
  bucket: 'claim-evidence',
  filePath: 'path',
  uploadedBy: 'other-user',
  name: 'evidence.pdf',
  fileType: 'application/pdf',
  fileSize: 123,
};

function createWhereSelectResult(result: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createLegacySelectResult(result: any[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function queueSelectResults(...results: any[]) {
  mockDb.select.mockReset();
  results.forEach(result => mockDb.select.mockReturnValueOnce(result));
}

describe('getDocumentAccessCore Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Polymorphic Documents', () => {
    it('allows a member to access their own member entity document uploaded by staff', async () => {
      queueSelectResults(createWhereSelectResult([memberPolymorphicDocument]));

      const result = await getDocumentAccessCore({
        session: memberSession as any,
        documentId: 'doc-profile',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result.ok).toBe(true);
    });

    it('denies a member from accessing another member profile document', async () => {
      queueSelectResults(createWhereSelectResult([memberPolymorphicDocument]));

      const result = await getDocumentAccessCore({
        session: otherMemberSession as any,
        documentId: 'doc-profile',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows a member to access documents in their own claim even if uploaded by others', async () => {
      queueSelectResults(
        createWhereSelectResult([claimScopedPolymorphicDocument]),
        createWhereSelectResult([branchScopedClaimRow]) // claimOwnerId is member-1
      );

      const result = await getDocumentAccessCore({
        session: memberSession as any,
        documentId: 'doc1',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result.ok).toBe(true);
    });

    it('denies a member from accessing documents in another member claim', async () => {
      queueSelectResults(
        createWhereSelectResult([claimScopedPolymorphicDocument]),
        createWhereSelectResult([branchScopedClaimRow]) // claimOwnerId is member-1
      );

      const result = await getDocumentAccessCore({
        session: otherMemberSession as any,
        documentId: 'doc1',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows a member to access their own policy document', async () => {
      queueSelectResults(
        createWhereSelectResult([policyPolymorphicDocument]),
        createWhereSelectResult([{ policyOwnerId: 'member-1' }])
      );

      const result = await getDocumentAccessCore({
        session: memberSession as any,
        documentId: 'doc-policy',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result.ok).toBe(true);
    });

    it('denies access if document is from a different tenant', async () => {
      // getDocumentAccessCore first queries documents table with tenantId from session
      // If we return empty list, it fails closed or moves to legacy
      queueSelectResults(createWhereSelectResult([]), createLegacySelectResult([]));

      const result = await getDocumentAccessCore({
        session: { user: { id: 'member-1', role: 'member', tenantId: 'tenant-wrong' } } as any,
        documentId: 'doc1',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Document not found' });
    });
  });

  describe('Legacy Claim Documents', () => {
    it('denies staff access to a legacy claim document outside their scoped branch', async () => {
      queueSelectResults(
        createWhereSelectResult([]), // Not in polymorphic
        createLegacySelectResult([
          {
            doc: legacyDocument,
            ...branchScopedClaimRow,
            claimBranchId: 'branch-b', // Different branch
          },
        ])
      );

      const result = await getDocumentAccessCore({
        session: {
          user: { id: 'staff-1', role: 'staff', tenantId: 't1', branchId: 'branch-a' },
        } as any,
        documentId: 'doc1',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    });

    it('allows claim owner to access legacy document even if uploaded by someone else', async () => {
      queueSelectResults(
        createWhereSelectResult([]),
        createLegacySelectResult([
          {
            doc: legacyDocument,
            ...branchScopedClaimRow, // owner is member-1
          },
        ])
      );

      const result = await getDocumentAccessCore({
        session: memberSession as any,
        documentId: 'doc1',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('Role-based Access', () => {
    it('allows admin full access regardless of ownership', async () => {
      queueSelectResults(createWhereSelectResult([memberPolymorphicDocument]));

      const result = await getDocumentAccessCore({
        session: { user: { id: 'admin-1', role: 'admin', tenantId: 't1' } } as any,
        documentId: 'doc-profile',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result.ok).toBe(true);
    });

    it('allows branch manager access to claim documents in their branch', async () => {
      queueSelectResults(
        createWhereSelectResult([claimScopedPolymorphicDocument]),
        createWhereSelectResult([branchScopedClaimRow]) // branch-a
      );

      const result = await getDocumentAccessCore({
        session: branchManagerSession as any,
        documentId: 'doc1',
        mode: 'download',
        deps: mockDeps,
      });

      expect(result.ok).toBe(true);
    });
  });
});
