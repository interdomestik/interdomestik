import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { PgDialect, QueryBuilder } from 'drizzle-orm/pg-core';
import { type SQL } from 'drizzle-orm';
import { vi } from 'vitest';
const hoisted = vi.hoisted(() => {
  const claimsFindFirst = vi.fn();
  const dbSelect = vi.fn();
  const getSession = vi.fn();
  const headersFn = vi.fn(() => Promise.resolve(new Headers([['host', 'ks.localhost:3000']])));
  const withTenantContext = vi.fn(
    async (_ctx: unknown, action: (tx: unknown) => unknown) =>
      await action({
        query: {
          claims: {
            findFirst: claimsFindFirst,
          },
        },
        select: dbSelect,
      })
  );
  const mapClaimToOperationalRow = vi.fn(() => ({
    id: 'claim-1',
    memberName: 'Member One',
    memberEmail: 'member@example.com',
    memberNumber: 'MEM-1',
    branchCode: 'KS-A',
    claimAmount: null,
    status: 'submitted',
    isDiasporaOrigin: false,
    diasporaCountry: null,
  }));
  return {
    claimsFindFirst,
    dbSelect,
    delegateClaimHomeTenantRead: vi.fn(),
    getSession,
    signDocument: vi.fn(),
    headersFn,
    searchAssignableStaff: vi.fn(),
    withTenantContext,
    mapClaimToOperationalRow,
  };
});
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));
vi.mock('@/lib/storage/service-role', () => ({
  createTenantSignedDownloadUrl: hoisted.signDocument,
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headersFn,
}));
vi.mock('@/lib/tenant/tenant-hosts', () => ({
  resolveTenantFromHost: vi.fn((host: string) => {
    if (host.includes('ks.localhost')) return 'tenant_ks';
    if (host.includes('mk.localhost')) return 'tenant_mk';
    return null;
  }),
}));

vi.mock('@interdomestik/domain-users/admin/search-assignable-staff', () => ({
  searchAssignableStaff: hoisted.searchAssignableStaff,
}));
vi.mock('../mappers/mapClaimToOperationalRow', () => ({
  mapClaimToOperationalRow: hoisted.mapClaimToOperationalRow,
}));

vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  withTenantContext: hoisted.withTenantContext,
  delegateClaimHomeTenantRead: hoisted.delegateClaimHomeTenantRead,
}));

export function sqlOf(value: SQL) {
  return new PgDialect().sqlToQuery(value);
}

export function createClaim() {
  const now = new Date('2026-02-22T00:00:00.000Z');
  return {
    id: 'claim-1',
    tenantId: 'tenant_home',
    title: 'Test claim',
    createdAt: now,
    updatedAt: now,
    assignedAt: null,
    userId: 'member-1',
    branchId: null,
    claimNumber: 'KS-000001',
    staffId: null,
    category: 'retail',
    currency: 'EUR',
    statusUpdatedAt: now,
    origin: 'portal',
    originRefId: null,
    description: 'Claim description',
    companyName: 'Company',
    claimAmount: null,
    caseLifecycleState: 'submitted',
    agentId: null,
    recoveryLifecycleState: 'not_started',
    staff: null,
    branch: {
      id: 'branch-1',
      code: 'KS-A',
      name: 'KS Branch A',
    },
  };
}

export function mockSelectChains(branchWhere?: ReturnType<typeof vi.fn>) {
  const docsRows = {
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const docsUnion = vi.fn().mockReturnValue(docsRows);
  const docsWhere = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    unionAll: docsUnion,
  });
  hoisted.dbSelect.mockImplementationOnce(fields => new QueryBuilder().select(fields));
  const peopleWhere = vi
    .fn()
    .mockResolvedValue([
      { id: 'member-1', name: 'Member One', email: 'member@example.com', memberNumber: 'MEM-1' },
    ]);
  const noteWhere = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
  });

  for (const where of [docsWhere, docsWhere, peopleWhere, branchWhere, noteWhere]) {
    if (!where) continue;
    hoisted.dbSelect.mockImplementationOnce(() => ({ from: () => ({ where }) }));
  }

  return { docsWhere, docsRows, docsUnion, peopleWhere, noteWhere };
}

/** Tenant and principal role of every authority the reads ran under, in order. */
export function readContexts(): Array<{ tenantId: string; role: string | null | undefined }> {
  return hoisted.withTenantContext.mock.calls.map(call => {
    const descriptor = readTenantAuthority(call[0] as TenantAuthority);
    return { tenantId: descriptor.tenantId, role: descriptor.principal?.role };
  });
}

export function resetOpsClaimDetailMocks(): void {
  vi.clearAllMocks();
  hoisted.dbSelect.mockReset();
  hoisted.signDocument.mockResolvedValue({ data: { signedUrl: 'signed-document-url' } });
  hoisted.getSession.mockResolvedValue({
    user: {
      id: 'admin-1',
      tenantId: 'tenant_ks',
      role: 'admin',
    },
  });
  hoisted.claimsFindFirst.mockResolvedValue(createClaim());
  hoisted.searchAssignableStaff.mockResolvedValue({ items: [], nextCursor: null });
  // Delegates to the claim's home tenant with the caller's principal, as the kernel producer does.
  hoisted.delegateClaimHomeTenantRead.mockImplementation((authority: TenantAuthority) => {
    const { principal } = readTenantAuthority(authority);
    return Promise.resolve(
      mintTestTenantAuthority('tenant_home', {
        userId: principal?.userId,
        role: principal?.role,
      })
    );
  });
  hoisted.withTenantContext.mockImplementation(
    async (_ctx: unknown, action: (tx: unknown) => unknown) =>
      await action({
        query: {
          claims: {
            findFirst: hoisted.claimsFindFirst,
          },
        },
        select: hoisted.dbSelect,
      })
  );
}

// Exported separately: Vitest rejects exporting a vi.hoisted declaration directly.
export { hoisted };
