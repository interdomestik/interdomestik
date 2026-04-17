import { describe, expect, it, vi } from 'vitest';
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

// Mock chaining for Drizzle
const mockSelectChain = (result: any[]) => {
  const from = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
      // Handle case without leftJoin
      then: (cb: any) => Promise.resolve(result).then(cb),
    }),
  });
  // Handle Polymorphic chain: select().from().where()
  const fromPoly = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(result),
  });

  mockDb.select.mockReturnValue({ from: fromPoly });
  return fromPoly;
};

describe('getDocumentAccessCore', () => {
  it('denies staff access to a legacy claim document outside their scoped branch', async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                doc: {
                  id: 'doc1',
                  claimId: 'claim-1',
                  bucket: 'claim-evidence',
                  filePath: 'path',
                  uploadedBy: 'other-user',
                  name: 'evidence.pdf',
                  fileType: 'application/pdf',
                  fileSize: 123,
                },
                claimOwnerId: 'member-1',
                claimBranchId: 'branch-b',
                claimStaffId: 'staff-2',
              },
            ]),
          }),
        }),
      });

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
    // Mock both poly and legacy queries returning empty
    const chain = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });

    // Use a simple mock for the chain to avoid complexity in test helpers
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]), // Poly returns empty
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // Legacy returns empty
        }),
      }),
    });

    const result = await getDocumentAccessCore({
      session: mockSession,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Document not found' });
  });

  it('returns FORBIDDEN if user is not owner/privileged', async () => {
    // Mock poly doc found but not owned
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 'doc1',
            storagePath: 'path',
            uploadedBy: 'other',
            tenantId: 't1',
          },
        ]),
      }),
    });

    const result = await getDocumentAccessCore({
      session: mockSession,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it('allows branch manager access to claim-scoped polymorphic documents in their branch', async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'doc1',
              entityType: 'claim',
              entityId: 'claim-1',
              storagePath: 'path',
              uploadedBy: 'other',
              fileName: 'evidence.pdf',
              mimeType: 'application/pdf',
              fileSize: 123,
              tenantId: 't1',
            },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              claimOwnerId: 'member-1',
              claimBranchId: 'branch-a',
              claimStaffId: 'staff-2',
            },
          ]),
        }),
      });

    const result = await getDocumentAccessCore({
      session: {
        user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
      } as never,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result.ok).toBe(true);
  });

  it('records signed-url audit metadata for polymorphic documents', async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'doc1',
              entityType: 'claim',
              entityId: 'claim-1',
              storagePath: 'path',
              uploadedBy: 'other',
              fileName: 'evidence.pdf',
              mimeType: 'application/pdf',
              fileSize: 123,
              tenantId: 't1',
            },
          ]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              claimOwnerId: 'member-1',
              claimBranchId: 'branch-a',
              claimStaffId: 'staff-2',
            },
          ]),
        }),
      });

    const result = await getDocumentAccessCore({
      session: {
        user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
      } as never,
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
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                doc: {
                  id: 'doc1',
                  claimId: 'claim-1',
                  bucket: 'claim-evidence',
                  filePath: 'path',
                  uploadedBy: 'other-user',
                  name: 'evidence.pdf',
                  fileType: 'application/pdf',
                  fileSize: 123,
                },
                claimOwnerId: 'member-1',
                claimBranchId: 'branch-a',
                claimStaffId: 'staff-2',
              },
            ]),
          }),
        }),
      });

    const result = await getDocumentAccessCore({
      session: {
        user: { id: 'manager-1', role: 'branch_manager', tenantId: 't1', branchId: 'branch-a' },
      } as never,
      documentId: 'doc1',
      mode: 'signed_url',
      deps: mockDeps,
    });

    expect(result.ok).toBe(true);
  });
});
