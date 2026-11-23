import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, vi } from 'vitest';

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

export const tx = {
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

export function staff(overrides: Partial<StaffUser> = {}) {
  const user: StaffUser = { id: 'staff-1', role: 'staff', ...overrides };
  return { user };
}

export const authority = mintTestTenantAuthority('tenant-a');

beforeEach(() => {
  vi.clearAllMocks();
  for (const list of [hoisted.froms, hoisted.selections, hoisted.wheres, hoisted.joins])
    list.length = 0;
  hoisted.withTenantContext.mockImplementation(
    async (_context: unknown, action: (handle: typeof tx) => Promise<unknown>) => action(tx)
  );
});

export { hoisted };
