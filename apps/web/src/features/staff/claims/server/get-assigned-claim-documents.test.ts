import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryChain = {
  from: (table: unknown) => QueryChain;
  innerJoin: (table: unknown, predicate: unknown) => QueryChain;
  leftJoin: (table: unknown, predicate: unknown) => QueryChain;
  limit: (count: number) => Promise<unknown[]> & { offset: (value: number) => Promise<unknown[]> };
  orderBy: (...order: unknown[]) => QueryChain;
  where: (predicate: unknown) => QueryChain;
};
type StaffUser = {
  id: string;
  role: string | null;
};

const hoisted = vi.hoisted(() => ({
  froms: [] as unknown[],
  joins: [] as unknown[],
  limit: vi.fn(),
  offset: vi.fn(),
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
  claimInformationRequestEvidence: {
    tenantId: 'link.tenant_id',
    claimId: 'link.claim_id',
    documentId: 'link.document_id',
  },
  claims: {
    caseLifecycleState: 'claims.case_lifecycle_state',
    id: 'claims.id',
    staffId: 'claims.staff_id',
    tenantId: 'claims.tenant_id',
  },
  withTenantContext: hoisted.withTenantContext,
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  isNull: (column: unknown) => ({ op: 'isNull', column }),
  ne: (left: unknown, right: unknown) => ({ op: 'ne', left, right }),
  sql: (parts: TemplateStringsArray, ...values: string[]) => String.raw({ raw: parts }, ...values),
}));

import {
  getAssignedStaffClaimDocuments,
  getRegisterPickerDocuments,
} from './get-assigned-claim-documents';

const tx = {
  select: vi.fn((selection: unknown) => {
    hoisted.selections.push(selection);
    const chain: QueryChain = {
      from: table => {
        hoisted.froms.push(table);
        return chain;
      },
      innerJoin: (table, predicate) => {
        hoisted.joins.push({ table, predicate });
        return chain;
      },
      leftJoin: (table, predicate) => {
        hoisted.joins.push({ table, predicate });
        return chain;
      },
      limit: count => {
        const rows: Promise<unknown[]> = hoisted.limit(count);
        return Object.assign(rows, {
          offset: (value: number) => {
            hoisted.offset(value);
            return rows;
          },
        });
      },
      orderBy: (...order) => {
        hoisted.orderBy(...order);
        return chain;
      },
      where: predicate => {
        hoisted.wheres.push(predicate);
        return chain;
      },
    };
    return chain;
  }),
};

function staff(overrides: Partial<StaffUser> = {}) {
  const user: StaffUser = { id: 'staff-1', role: 'staff', ...overrides };
  return { user };
}

const authority = mintTestTenantAuthority('tenant-a');

function read(session = staff(), sessionAuthority: typeof authority | null = authority) {
  return getAssignedStaffClaimDocuments({
    claimId: 'claim-1',
    session,
    authority: sessionAuthority,
  });
}
const emptyPage = { page: 1, documents: [], hasNextPage: false };

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of [hoisted.froms, hoisted.selections, hoisted.wheres, hoisted.joins])
    list.length = 0;
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, action: (handle: typeof tx) => Promise<unknown>) => action(tx)
  );
});

describe('getAssignedStaffClaimDocuments', () => {
  it('returns the minimal projection and canonical links to assigned staff', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.limit.mockResolvedValueOnce([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        filePath: 'pii/tenants/tenant-a/claims/claim-1/doc-1.pdf',
      },
    ]);

    const documents = await read();

    expect(documents.documents).toEqual([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        url: '/api/documents/doc-1/download',
      },
    ]);
    expect(JSON.stringify(documents)).not.toContain('pii/');
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext.mock.calls[0]![0]).toBe(authority);
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
          { op: 'ne', left: 'claims.case_lifecycle_state', right: 'draft' },
        ],
      },
      {
        op: 'and',
        args: [
          { op: 'eq', left: 'claim_documents.claim_id', right: 'claim-1' },
          { op: 'eq', left: 'claim_documents.tenant_id', right: 'tenant-a' },
          { op: 'isNull', column: 'link.document_id' },
          undefined,
        ],
      },
    ]);
    expect(hoisted.joins).toEqual([
      {
        table: expect.objectContaining({ id: 'claims.id' }),
        predicate: {
          op: 'and',
          args: [
            { op: 'eq', left: 'claims.id', right: 'claim_documents.claim_id' },
            { op: 'eq', left: 'claims.tenant_id', right: 'tenant-a' },
            { op: 'eq', left: 'claims.staff_id', right: 'staff-1' },
            { op: 'ne', left: 'claims.case_lifecycle_state', right: 'draft' },
          ],
        },
      },
      expect.objectContaining({
        predicate: {
          op: 'and',
          args: [
            { op: 'eq', left: 'link.tenant_id', right: 'tenant-a' },
            { op: 'eq', left: 'link.claim_id', right: 'claim-1' },
            { op: 'eq', left: 'link.document_id', right: 'claim_documents.id' },
          ],
        },
      }),
    ]);
    expect(hoisted.orderBy).toHaveBeenCalledWith(
      'claim_documents.created_at desc nulls last',
      'claim_documents.id'
    );
    expect(hoisted.limit).toHaveBeenLastCalledWith(21);
    expect(hoisted.offset).toHaveBeenCalledWith(0);
  });

  it('encodes document ids in the canonical authorized download route', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.limit.mockResolvedValueOnce([
      { id: 'doc/1?x', name: 'a.pdf', fileType: 'application/pdf', fileSize: 1 },
    ]);

    expect((await read()).documents).toEqual([
      expect.objectContaining({ url: '/api/documents/doc%2F1%3Fx/download' }),
    ]);
  });

  it('issues no document query for a wrong assignee, even in the same branch', async () => {
    hoisted.limit.mockResolvedValueOnce([]);

    await expect(read(staff({ id: 'staff-2' }))).resolves.toEqual(emptyPage);
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
      await expect(read(staff({ role }))).resolves.toEqual(emptyPage);
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(tx.select).not.toHaveBeenCalled();
    }
  );

  it('returns no documents and opens no context without a session authority', async () => {
    await expect(read(staff(), null)).resolves.toEqual(emptyPage);
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(tx.select).not.toHaveBeenCalled();
  });

  it('reads under the authority it is given, never a tenant carried by the session object', async () => {
    const other = mintTestTenantAuthority('tenant-b');
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]);
    hoisted.limit.mockResolvedValueOnce([
      { id: 'doc-b', name: 'access.pdf', fileType: 'application/pdf', fileSize: 2 },
    ]);
    expect((await read(staff(), other)).documents).toEqual([
      {
        id: 'doc-b',
        name: 'access.pdf',
        fileType: 'application/pdf',
        fileSize: 2,
        url: '/api/documents/doc-b/download',
      },
    ]);
    expect(hoisted.withTenantContext.mock.calls[0]![0]).toBe(other);
    expect(hoisted.wheres[0]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([{ op: 'eq', left: 'claims.tenant_id', right: 'tenant-b' }]),
      })
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

  it('pages through ordinary evidence past row 100 and clamps the requested size', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: `doc-${101 + index}`,
      name: 'Evidence',
      fileType: 'application/pdf',
      fileSize: 1,
    }));
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]).mockResolvedValueOnce(rows);
    const result = await getAssignedStaffClaimDocuments({
      claimId: 'claim-1',
      session: staff(),
      authority,
      page: 3,
      perPage: 1000,
    });
    expect(hoisted.offset).toHaveBeenCalledExactlyOnceWith(100);
    expect(hoisted.limit).toHaveBeenLastCalledWith(51);
    expect(result.documents).toHaveLength(50);
    expect(result.documents[0]?.url).toBe('/api/documents/doc-101/download');
    expect(result.hasNextPage).toBe(true);
  });

  it('filters the picker by citation provenance before the ordered 100-row limit', async () => {
    hoisted.limit.mockResolvedValueOnce([{ id: 'claim-1' }]).mockResolvedValueOnce([]);
    await getRegisterPickerDocuments({ claimId: 'claim-1', session: staff(), authority });
    expect(hoisted.wheres[1]).toEqual(
      expect.objectContaining({
        args: expect.arrayContaining([
          'public.claim_document_provenance_ok(claim_documents.tenant_id, claim_documents.claim_id, claim_documents.id)',
        ]),
      })
    );
    expect(hoisted.orderBy).toHaveBeenCalledExactlyOnceWith(
      'claim_documents.created_at desc nulls last',
      'claim_documents.id'
    );
    expect(hoisted.limit).toHaveBeenLastCalledWith(100);
    expect(hoisted.offset).not.toHaveBeenCalled();
  });
});
