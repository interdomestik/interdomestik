import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./durable-case-grants', () => ({
  hasDurableCaseScopedDocumentGrant: vi.fn().mockResolvedValue(false),
}));

vi.mock('./cross-tenant-document-lookup', () => ({
  lookupCrossGrantDoc: vi.fn().mockResolvedValue(null),
}));

import { getDocumentAccessCore, type DocumentAccessDeps } from './_core';
import { lookupCrossGrantDoc } from './cross-tenant-document-lookup';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

const mockDb = { select: vi.fn() };
const mockDeps: DocumentAccessDeps = {
  db: mockDb as unknown as DocumentAccessDeps['db'],
  storage: { createSignedUrl: vi.fn(), download: vi.fn() },
};
const session = { user: { id: 'local-legal-1', role: 'staff', tenantId: 't1' } };

function selectResult(rows: unknown[], isLegacy = false) {
  const chain = { where: vi.fn().mockResolvedValue(rows) };
  return {
    from: vi.fn().mockReturnValue(isLegacy ? { leftJoin: vi.fn().mockReturnValue(chain) } : chain),
  };
}

function setup(poly: unknown[] = [], second: unknown[] = [], secondIsLegacy = true) {
  mockDb.select.mockReset();
  mockDb.select.mockReturnValue(selectResult([]));
  mockDb.select.mockReturnValueOnce(selectResult(poly));
  mockDb.select.mockReturnValueOnce(selectResult(second, secondIsLegacy));
}

function claimDoc(category = 'legal') {
  return {
    id: 'doc-1',
    entityId: 'claim-1',
    entityType: 'claim',
    category,
    storagePath: 'claims/claim-1/legal.pdf',
    uploadedBy: 'member-1',
  };
}

describe('document durable case grant boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValue(false);
    vi.mocked(lookupCrossGrantDoc).mockResolvedValue(null);
  });

  it('allows polymorphic claim documents when the durable grant authorizes the case', async () => {
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValueOnce(true);
    setup([claimDoc()], [{ claimOwnerId: 'member-1' }], false);

    await expect(
      getDocumentAccessCore({ deps: mockDeps, documentId: 'doc-1', mode: 'download', session })
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(hasDurableCaseScopedDocumentGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTenantId: 't1',
        actorId: 'local-legal-1',
        caseId: 'claim-1',
        documentClass: 'legal',
      })
    );
  });

  it('allows legacy claim documents when the durable grant authorizes the case', async () => {
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValueOnce(true);
    setup(
      [],
      [
        {
          doc: { id: 'doc-1', claimId: 'claim-1', category: 'legal', uploadedBy: 'member-1' },
          claimOwnerId: 'member-1',
        },
      ]
    );

    await expect(
      getDocumentAccessCore({ deps: mockDeps, documentId: 'doc-1', mode: 'download', session })
    ).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(hasDurableCaseScopedDocumentGrant).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'claim-1', documentClass: 'legal' })
    );
  });

  it.each([
    ['member profile', { ...claimDoc(), entityId: 'member-1', entityType: 'member' }],
    ['membership entity', { ...claimDoc(), entityId: 'membership-1', entityType: 'membership' }],
  ])('does not apply durable case grants to %s documents', async (_label, doc) => {
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValueOnce(true);
    setup([doc]);

    await expect(
      getDocumentAccessCore({ deps: mockDeps, documentId: 'doc-1', mode: 'download', session })
    ).resolves.toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
    expect(hasDurableCaseScopedDocumentGrant).not.toHaveBeenCalled();
  });

  it('allows cross-tenant document access via jurisdiction handoff grant', async () => {
    const legacyDoc = { id: 'doc-1', claimId: 'claim-1', bucket: 'claim-evidence', filePath: 'f' };
    vi.mocked(lookupCrossGrantDoc).mockResolvedValueOnce({
      kind: 'legacy',
      doc: legacyDoc as never,
      homeTenantId: 'home-t',
    });
    setup([], [], true);

    await expect(
      getDocumentAccessCore({ deps: mockDeps, documentId: 'doc-1', mode: 'download', session })
    ).resolves.toEqual(expect.objectContaining({ ok: true, tenantId: 'home-t' }));
  });

  it('denies cross-tenant document access when grant does not cover the document class', async () => {
    vi.mocked(lookupCrossGrantDoc).mockResolvedValueOnce({ kind: 'forbidden' });
    setup([], [], true);

    await expect(
      getDocumentAccessCore({ deps: mockDeps, documentId: 'doc-1', mode: 'download', session })
    ).resolves.toEqual({ ok: false, code: 'FORBIDDEN', message: 'Forbidden' });
  });
});
