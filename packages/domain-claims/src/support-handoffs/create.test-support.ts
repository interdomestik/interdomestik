import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';
import type { SupportHandoffSession } from './types';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

type MocksMocks = {
  and: MockFunction;
  claims: {
    branchId: string;
    createdAt: string;
    id: string;
    staffId: string;
    caseLifecycleState: string;
    recoveryLifecycleState: string;
    statusUpdatedAt: string;
    tenantId: string;
    updatedAt: string;
    userId: string;
  };
  db: {
    insert: MockFunction;
    select: MockFunction;
  };
  desc: MockFunction;
  eq: MockFunction;
  insertChain: {
    values: MockFunction;
  };
  insertValues: MockFunction;
  logAuditEvent: MockFunction;
  randomUUID: MockFunction;
  selectChain: {
    from: MockFunction;
    limit: MockFunction;
    orderBy: MockFunction;
    where: MockFunction;
  };
  subscriptions: {
    branchId: string;
    createdAt: string;
    tenantId: string;
    userId: string;
  };
  supportHandoffs: string;
  withTenant: MockFunction;
  withTenantContext: MockFunction;
};

const mocks: MocksMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  const insertValues = vi.fn();
  const insertChain = {
    values: insertValues,
  };

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    claims: {
      branchId: 'claims.branch_id',
      createdAt: 'claims.created_at',
      id: 'claims.id',
      staffId: 'claims.staff_id',
      caseLifecycleState: 'claims.case_lifecycle_state',
      recoveryLifecycleState: 'claims.recovery_lifecycle_state',
      statusUpdatedAt: 'claims.status_updated_at',
      tenantId: 'claims.tenant_id',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
    },
    db: {
      insert: vi.fn(() => insertChain),
      select: vi.fn(() => selectChain),
    },
    desc: vi.fn(column => ({ column, op: 'desc' })),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    insertChain,
    insertValues,
    logAuditEvent: vi.fn(),
    randomUUID: vi.fn(() => 'handoff-uuid'),
    selectChain,
    subscriptions: {
      branchId: 'subscriptions.branch_id',
      createdAt: 'subscriptions.created_at',
      tenantId: 'subscriptions.tenant_id',
      userId: 'subscriptions.user_id',
    },
    supportHandoffs: 'support_handoffs',
    withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
    withTenantContext: vi.fn((_context, action) => action(mocks.db)),
  };
});

vi.mock('node:crypto', () => ({ randomUUID: mocks.randomUUID }));

vi.mock('@interdomestik/database', () => ({
  claims: mocks.claims,
  db: mocks.db,
  desc: mocks.desc,
  eq: mocks.eq,
  subscriptions: mocks.subscriptions,
  supportHandoffs: mocks.supportHandoffs,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
  sql: vi.fn((strings, ...values) => ({ op: 'sql', strings, values })),
}));

export function memberSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: {
      branchId: 'branch-session',
      id: 'member-1',
      role: 'member',
      tenantId: 'tenant-1',
      ...overrides,
    },
  } as SupportHandoffSession;
}

export const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');

export const ownedClaimContext = {
  branchId: 'branch-claim',
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  id: 'claim-1',
  staffId: null,
  status: 'submitted',
  statusUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
} as const;

export { mocks };
