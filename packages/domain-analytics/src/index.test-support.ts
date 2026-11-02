import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

type MocksMocks = {
  queryPlans: Array<{ at: 'from' | 'where'; result: Array<Record<string, unknown>> }>;
  db: {
    select: MockFunction;
  };
  and: MockFunction;
  count: MockFunction;
  eq: MockFunction;
  claimLifecycleStatusIn: MockFunction;
  claimLifecycleStatusIs: MockFunction;
  sql: MockFunction;
  sum: MockFunction;
  listTenantIdsForPlatformAggregate: Mock<() => Promise<string[]>>;
  listSuperAdminAggregateWork: MockFunction;
  produced: unknown[];
};

const mocks: MocksMocks = vi.hoisted(() => {
  const queryPlans: Array<{ at: 'from' | 'where'; result: Array<Record<string, unknown>> }> = [];

  const db = {
    select: vi.fn(() => {
      const plan = queryPlans.shift();
      if (!plan) {
        throw new Error('Missing query plan');
      }

      const chain = {
        from: vi.fn(() => (plan.at === 'from' ? Promise.resolve(plan.result) : chain)),
        where: vi.fn(() => Promise.resolve(plan.result)),
        innerJoin: vi.fn(() => chain),
      };

      return chain;
    }),
  };

  return {
    queryPlans,
    db,
    and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
    count: vi.fn(() => ({ op: 'count' })),
    eq: vi.fn((left: unknown, right: unknown) => ({ left, right, op: 'eq' })),
    claimLifecycleStatusIn: vi.fn((statuses: readonly string[]) => ({ statuses })),
    claimLifecycleStatusIs: vi.fn((status: string) => ({ op: 'claimLifecycleStatusIs', status })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    sum: vi.fn((value: unknown) => ({ op: 'sum', value })),
    listTenantIdsForPlatformAggregate: vi.fn(async (): Promise<string[]> => []),
    listSuperAdminAggregateWork: vi.fn(),
    produced: [] as unknown[],
  };
});

vi.mock('@interdomestik/database', () => ({
  listSuperAdminAggregateWork: mocks.listSuperAdminAggregateWork,
  db: mocks.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => cb(mocks.db)),
}));

vi.mock('@interdomestik/database/schema', () => ({
  agentClients: {
    agentId: 'agent_clients.agent_id',
    status: 'agent_clients.status',
    tenantId: 'agent_clients.tenant_id',
  },
  agentCommissions: {
    agentId: 'agent_commissions.agent_id',
    amount: 'agent_commissions.amount',
    status: 'agent_commissions.status',
    tenantId: 'agent_commissions.tenant_id',
  },
  branches: { tenantId: 'branches.tenant_id' },
  claims: {
    agentId: 'claims.agent_id',
    branchId: 'claims.branch_id',
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
  },
  tenants: { id: 'tenants.id' },
  user: {
    branchId: 'user.branch_id',
    id: 'user.id',
    role: 'user.role',
    tenantId: 'user.tenant_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  count: mocks.count,
  eq: mocks.eq,
  sql: mocks.sql,
  sum: mocks.sum,
}));

vi.mock('@interdomestik/domain-claims', () => ({
  claimLifecycleStatusIn: mocks.claimLifecycleStatusIn,
  claimLifecycleStatusIs: mocks.claimLifecycleStatusIs,
}));

export function queuePlans(
  ...plans: Array<{ at: 'from' | 'where'; result: Array<Record<string, unknown>> }>
) {
  mocks.queryPlans.push(...plans);
}

export const superAdminActor: TenantAuthority = mintTestTenantAuthority('tenant-home', {
  userId: 'sa-1',
  role: 'super_admin',
});
export const actorWithRole = (role: string | null | undefined): TenantAuthority =>
  role === undefined
    ? mintTestTenantAuthority('tenant-home')
    : mintTestTenantAuthority('tenant-home', { userId: 'user-1', role });

export { mocks };
