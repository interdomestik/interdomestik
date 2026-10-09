import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = {
  from: (table: unknown) => QueryChain;
  limit: (count: number) => Promise<unknown[]>;
  orderBy: (order: unknown) => Promise<unknown[]>;
  where: (predicate: unknown) => QueryChain;
};
type StaffUser = {
  id: string;
  role: string | null;
  tenantId: string | null;
  accessTenantId?: string | null;
};

const hoisted = vi.hoisted(() => ({
  froms: [] as unknown[],
  limit: vi.fn(),
  orderBy: vi.fn(),
  selections: [] as unknown[],
  wheres: [] as unknown[],
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  claimDocuments: {
    bucket: 'claim_documents.bucket',
    claimId: 'claim_documents.claim_id',
    createdAt: 'claim_documents.created_at',
    filePath: 'claim_documents.file_path',
    fileSize: 'claim_documents.file_size',
    fileType: 'claim_documents.file_type',
    id: 'claim_documents.id',
    name: 'claim_documents.name',
    tenantId: 'claim_documents.tenant_id',
  },
  claims: { id: 'claims.id', staffId: 'claims.staff_id', tenantId: 'claims.tenant_id' },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (column: unknown) => ({ op: 'desc', column }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
}));

import { getAssignedStaffClaimDocuments } from './get-assigned-claim-documents';

const tx = {
  select: vi.fn((selection: unknown) => {
    hoisted.selections.push(selection);
    const chain: QueryChain = {
      from: table => {
        hoisted.froms.push(table);
        return chain;
      },
      limit: hoisted.limit,
      orderBy: hoisted.orderBy,
      where: predicate => {
        hoisted.wheres.push(predicate);
        return chain;
      },
    };
    return chain;
  }),
};

function staff(overrides: Partial<StaffUser> = {}) {
  const user: StaffUser = { id: 'staff-1', role: 'staff', tenantId: 'tenant-a', ...overrides };
  return { user };
}

function read(session = staff()) {
  return getAssignedStaffClaimDocuments({ claimId: 'claim-1', session });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of [hoisted.froms, hoisted.selections, hoisted.wheres]) list.length = 0;
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, action: (handle: typeof tx) => Promise<unknown>) => action(tx)
  );
});

describe('getAssignedStaffClaimDocuments', () => {
  it('returns the minimal projection and canonical links to assigned staff', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.orderBy.mockResolvedValueOnce([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        filePath: 'pii/tenants/tenant-a/claims/claim-1/doc-1.pdf',
      },
    ]);

    const documents = await read();

    expect(documents).toEqual([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        url: '/api/documents/doc-1/download',
      },
    ]);
    expect(JSON.stringify(documents)).not.toContain('pii/');
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', role: 'staff' },
      expect.any(Function)
    );
    expect(hoisted.froms).toEqual([
      expect.objectContaining({ id: 'claims.id' }),
      expect.objectContaining({ id: 'claim_documents.id' }),
    ]);
    expect(hoisted.selections).toEqual([
      { id: 'claims.id' },
      {
        id: 'claim_documents.id',
        name: 'claim_documents.name',
        fileType: 'claim_documents.file_type',
        fileSize: 'claim_documents.file_size',
      },
    ]);
    expect(hoisted.wheres).toEqual([
      {
        op: 'and',
        args: [
          { op: 'eq', left: 'claims.id', right: 'claim-1' },
          { op: 'eq', left: 'claims.tenant_id', right: 'tenant-a' },
          { op: 'eq', left: 'claims.staff_id', right: 'staff-1' },
        ],
      },
      {
        op: 'and',
        args: [
          { op: 'eq', left: 'claim_documents.claim_id', right: 'claim-1' },
          { op: 'eq', left: 'claim_documents.tenant_id', right: 'tenant-a' },
        ],
      },
    ]);
    expect(hoisted.orderBy).toHaveBeenCalledWith({
      op: 'desc',
      column: 'claim_documents.created_at',
    });
  });

  it('encodes document ids in the canonical authorized download route', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.orderBy.mockResolvedValueOnce([
      { id: 'doc/1?x', name: 'a.pdf', fileType: 'application/pdf', fileSize: 1 },
    ]);

    await expect(read()).resolves.toEqual([
      expect.objectContaining({ url: '/api/documents/doc%2F1%3Fx/download' }),
    ]);
  });

  it('issues no document query for a wrong assignee, even in the same branch', async () => {
    hoisted.limit.mockResolvedValueOnce([]);

    await expect(read(staff({ id: 'staff-2' }))).resolves.toEqual([]);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(hoisted.wheres[0]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([{ op: 'eq', left: 'claims.staff_id', right: 'staff-2' }]),
      })
    );
    expect(hoisted.orderBy).not.toHaveBeenCalled();
  });

  it.each(['branch_manager', 'admin', 'agent', 'member', null])(
    'returns no documents and opens no context for role %s',
    async role => {
      await expect(read(staff({ role }))).resolves.toEqual([]);
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(tx.select).not.toHaveBeenCalled();
    }
  );

  it('returns no documents without a trusted session tenant', async () => {
    await expect(read(staff({ tenantId: ' ' }))).resolves.toEqual([]);
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('does not read home-tenant evidence when explicit access belongs elsewhere', async () => {
    hoisted.limit.mockResolvedValueOnce([]);
    await expect(read(staff({ accessTenantId: 'tenant-b' }))).resolves.toEqual([]);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-b', role: 'staff' },
      expect.any(Function)
    );
    expect(hoisted.wheres[0]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([{ op: 'eq', left: 'claims.tenant_id', right: 'tenant-b' }]),
      })
    );
    expect(hoisted.orderBy).not.toHaveBeenCalled();
  });

  it('reads assigned access-local evidence using explicit access rather than the home tenant', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.orderBy.mockResolvedValueOnce([
      { id: 'doc-b', name: 'access.pdf', fileType: 'application/pdf', fileSize: 2 },
    ]);
    await expect(
      read(staff({ tenantId: 'tenant-home', accessTenantId: 'tenant-b' }))
    ).resolves.toEqual([
      {
        id: 'doc-b',
        name: 'access.pdf',
        fileType: 'application/pdf',
        fileSize: 2,
        url: '/api/documents/doc-b/download',
      },
    ]);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-b', role: 'staff' },
      expect.any(Function)
    );
    expect(hoisted.wheres[1]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([
          { op: 'eq', left: 'claim_documents.tenant_id', right: 'tenant-b' },
        ]),
      })
    );
  });

  it('propagates tenant transaction failures to the page caller', async () => {
    hoisted.withTenantContext.mockRejectedValueOnce(new Error('tenant context unavailable'));

    await expect(read()).rejects.toThrow('tenant context unavailable');
    expect(tx.select).not.toHaveBeenCalled();
  });
});
