import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cross-tenant-document-lookup', () => ({ lookupCrossGrantDoc: vi.fn() }));
vi.mock('./durable-case-grants', () => ({ hasDurableCaseScopedDocumentGrant: vi.fn() }));

import { getDocumentAccessCore, type DocumentAccessDeps } from './_core';
import { lookupCrossGrantDoc } from './cross-tenant-document-lookup';
import { hasDurableCaseScopedDocumentGrant } from './durable-case-grants';

type SelectChain = { leftJoin: () => SelectChain; where: () => Promise<unknown[]> };
type Session = Parameters<typeof getDocumentAccessCore>[0]['session'];

const tenantTx = { active: false, released: 0 };
const txDb = { select: vi.fn() };
const baseDb = {
  select: vi.fn(() => {
    throw new Error('base client used for a normal-tenant read');
  }),
};
const runner = vi.fn(async (_context: unknown, action: (tx: never) => Promise<unknown>) => {
  tenantTx.active = true;
  try {
    return await action(txDb as never);
  } finally {
    tenantTx.active = false;
    tenantTx.released += 1;
  }
});
const deps: DocumentAccessDeps = {
  db: baseDb as unknown as DocumentAccessDeps['db'],
  storage: { createSignedUrl: vi.fn(), download: vi.fn() },
  withTenantContext: runner as unknown as DocumentAccessDeps['withTenantContext'],
};

function rowsWhileOpen(rows: unknown[]) {
  const chain: SelectChain = {
    leftJoin: () => chain,
    where: async () => {
      // Normal-tenant reads must run while the tenant-bound transaction is still open.
      expect(tenantTx.active).toBe(true);
      return rows;
    },
  };
  return { from: () => chain };
}

function setupLocalReads(...results: unknown[][]) {
  txDb.select.mockReset().mockReturnValue(rowsWhileOpen([]));
  for (const rows of results) txDb.select.mockReturnValueOnce(rowsWhileOpen(rows));
}

function legacyDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    tenantId: 'tenant-a',
    accessTenantId: 'tenant-a',
    claimId: 'claim-1',
    category: 'evidence',
    bucket: 'claim-evidence',
    filePath: 'pii/tenants/tenant-a/claims/claim-1/doc-1.pdf',
    uploadedBy: 'member-1',
    name: 'evidence.pdf',
    fileType: 'application/pdf',
    fileSize: 1024,
    ...overrides,
  };
}

const claimRow = {
  claimOwnerId: 'member-1',
  claimBranchId: 'branch-a',
  claimStaffId: 'staff-1',
  claimAgentId: null,
};

function user(id: string, role: string): Session {
  return { user: { id, role, tenantId: 'tenant-a', branchId: 'branch-a' } };
}

function access(session: Session) {
  return getDocumentAccessCore({ deps, documentId: 'doc-1', mode: 'download', session });
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantTx.active = false;
  tenantTx.released = 0;
  vi.mocked(hasDurableCaseScopedDocumentGrant).mockResolvedValue(false);
  vi.mocked(lookupCrossGrantDoc).mockResolvedValue(null);
});

describe('getDocumentAccessCore normal-tenant transaction', () => {
  it.each([
    { label: 'explicit-tenant owner', session: user('member-1', 'member'), doc: legacyDoc() },
    {
      label: 'null-legacy owner',
      session: user('member-1', 'member'),
      doc: legacyDoc({ accessTenantId: null }),
    },
    { label: 'assigned staff', session: user('staff-1', 'staff'), doc: legacyDoc() },
  ])('returns the exact DTO to the $label', async ({ session, doc }) => {
    setupLocalReads([], [{ doc, ...claimRow }]);

    await expect(access(session)).resolves.toEqual({
      ok: true,
      document: doc,
      storageFamily: 'claims',
      tenantId: 'tenant-a',
      audit: {
        action: 'document.download',
        entityType: 'claim_document',
        entityId: 'doc-1',
        actorRole: session.user.role,
        metadata: {
          claimId: 'claim-1',
          bucket: 'claim-evidence',
          filePath: 'pii/tenants/tenant-a/claims/claim-1/doc-1.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          disposition: 'attachment',
        },
      },
    });
    expect(runner).toHaveBeenCalledWith(
      { accessTenantId: 'tenant-a', role: session.user.role, tenantId: 'tenant-a' },
      expect.any(Function)
    );
    expect(baseDb.select).not.toHaveBeenCalled();
    expect(lookupCrossGrantDoc).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'wrong owner', session: user('member-2', 'member') },
    { label: 'unassigned same-branch staff', session: user('staff-2', 'staff') },
  ])('denies the $label inside the transaction without fallback', async ({ session }) => {
    setupLocalReads([], [{ doc: legacyDoc(), ...claimRow }]);

    await expect(access(session)).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
      message: 'Forbidden',
    });
    expect(hasDurableCaseScopedDocumentGrant).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTenantId: 'tenant-a',
        actorId: session.user.id,
        caseId: 'claim-1',
        db: txDb,
      })
    );
    expect(baseDb.select).not.toHaveBeenCalled();
    expect(lookupCrossGrantDoc).not.toHaveBeenCalled();
  });

  it('keeps same-tenant durable grants on the pass-through tenant transaction', async () => {
    vi.mocked(hasDurableCaseScopedDocumentGrant).mockImplementationOnce(async args => {
      expect(tenantTx.active).toBe(true);
      expect(args.db).toBe(txDb);
      return true;
    });
    setupLocalReads([], [{ doc: legacyDoc({ category: 'legal' }), ...claimRow }]);

    await expect(access(user('staff-2', 'staff'))).resolves.toEqual(
      expect.objectContaining({ ok: true, tenantId: 'tenant-a' })
    );
    expect(lookupCrossGrantDoc).not.toHaveBeenCalled();
  });

  it('uses the effective access tenant, not the session compatibility tenant', async () => {
    setupLocalReads([], []);

    await access({
      user: {
        id: 'member-1',
        role: 'member',
        tenantId: 'tenant-legal',
        accessTenantId: 'tenant-a',
      },
    });

    expect(runner).toHaveBeenCalledWith(
      { accessTenantId: 'tenant-a', role: 'member', tenantId: 'tenant-a' },
      expect.any(Function)
    );
  });
});

describe('getDocumentAccessCore cross-tenant fallback', () => {
  it('runs the fallback on the base client after release', async () => {
    setupLocalReads([], []);
    const homeDoc = legacyDoc({ tenantId: 'tenant-home', accessTenantId: null });
    vi.mocked(lookupCrossGrantDoc).mockImplementationOnce(async args => {
      expect(tenantTx.active).toBe(false);
      expect(tenantTx.released).toBe(1);
      expect(args.db).toBe(baseDb);
      return { kind: 'legacy', doc: homeDoc as never, homeTenantId: 'tenant-home' };
    });

    await expect(access(user('legal-1', 'staff'))).resolves.toEqual(
      expect.objectContaining({ ok: true, document: homeDoc, tenantId: 'tenant-home' })
    );
    expect(lookupCrossGrantDoc).toHaveBeenCalledWith({
      actorId: 'legal-1',
      accessTenantId: 'tenant-a',
      db: baseDb,
      documentId: 'doc-1',
    });
  });

  it('returns NOT_FOUND for foreign-tenant or missing documents without a grant', async () => {
    setupLocalReads([], []);

    await expect(access(user('member-1', 'member'))).resolves.toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Document not found',
    });
    expect(tenantTx.released).toBe(1);
    expect(lookupCrossGrantDoc).toHaveBeenCalledTimes(1);
  });

  it('propagates tenant context failures instead of failing open to the fallback', async () => {
    runner.mockRejectedValueOnce(new Error('tenant context unavailable'));

    await expect(access(user('member-1', 'member'))).rejects.toThrow('tenant context unavailable');
    expect(lookupCrossGrantDoc).not.toHaveBeenCalled();
    expect(baseDb.select).not.toHaveBeenCalled();
  });
});
