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

const mockSession = { user: { id: 'u1', role: 'member', tenantId: 't1' } };
const branchManagerSession = {
  user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
} as const;

const branchScopedClaimRow = {
  claimOwnerId: 'member-1',
  claimBranchId: 'branch-a',
  claimStaffId: 'staff-2',
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

function queueScopedPolymorphicDocumentAccess() {
  queueSelectResults(
    createWhereSelectResult([claimScopedPolymorphicDocument]),
    createWhereSelectResult([branchScopedClaimRow])
  );
}

function queueLegacyDocumentAccess(claimBranchId: string) {
  queueSelectResults(
    createWhereSelectResult([]),
    createLegacySelectResult([
      {
        doc: legacyDocument,
        ...branchScopedClaimRow,
        claimBranchId,
      },
    ])
  );
}

describe('getDocumentAccessCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies staff access to a legacy claim document outside their scoped branch', async () => {
    queueLegacyDocumentAccess('branch-b');

    const result = await getDocumentAccessCore({
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 't1', branchId: 'branch-a' },
      } as never,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('returns NOT_FOUND if document does not exist', async () => {
    queueSelectResults(createWhereSelectResult([]), createLegacySelectResult([]));

    const result = await getDocumentAccessCore({
      session: mockSession,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Document not found' });
  });

  it('returns FORBIDDEN if user is not owner/privileged', async () => {
    queueSelectResults(
      createWhereSelectResult([
        {
          id: 'doc1',
          storagePath: 'path',
          uploadedBy: 'other',
          tenantId: 't1',
        },
      ])
    );

    const result = await getDocumentAccessCore({
      session: mockSession,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('allows branch manager access to claim-scoped polymorphic documents in their branch', async () => {
    queueScopedPolymorphicDocumentAccess();

    const result = await getDocumentAccessCore({
      session: branchManagerSession as never,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result.ok).toBe(true);
  });

  it('records signed-url audit metadata for polymorphic documents', async () => {
    queueScopedPolymorphicDocumentAccess();

    const result = await getDocumentAccessCore({
      session: branchManagerSession as never,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result).toMatchObject({
      ok: true,
      audit: {
        action: 'document.signed_url_issued',
        metadata: {
          bucket: 'claim-evidence',
          expiresInSeconds: 300,
          filePath: 'path',
        },
      },
    });
  });

  it('allows branch manager access to legacy claim documents in their branch', async () => {
    queueLegacyDocumentAccess('branch-a');

    const result = await getDocumentAccessCore({
      session: branchManagerSession as never,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result.ok).toBe(true);
  });
});
