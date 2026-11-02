import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';
import type { SupportHandoffSession } from './types';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

type MocksMocks = {
  and: MockFunction;
  db: {
    select: MockFunction;
    update: MockFunction;
  };
  ensureTenantId: MockFunction;
  eq: MockFunction;
  inArray: MockFunction;
  isNotNull: MockFunction;
  logAuditEvent: MockFunction;
  selectFrom: MockFunction;
  selectLimit: MockFunction;
  selectWhere: MockFunction;
  sql: MockFunction;
  supportHandoffs: {
    id: string;
    memberId: string;
    publicResponse: string;
    publicResponseAcknowledgedAt: string;
    publicResponseAcknowledgedById: string;
    publicResponseAcknowledgedVersion: string;
    publicResponseVersion: string;
    status: string;
    tenantId: string;
    updatedAt: string;
  };
  updateReturning: MockFunction;
  updateSet: MockFunction;
  updateWhere: MockFunction;
  withTenant: MockFunction;
};

const mocks: MocksMocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    db: {
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    },
    ensureTenantId: vi.fn(() => 'tenant-1'),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    inArray: vi.fn((left, right) => ({ left, op: 'inArray', right })),
    isNotNull: vi.fn(column => ({ column, op: 'isNotNull' })),
    logAuditEvent: vi.fn(),
    selectFrom,
    selectLimit,
    selectWhere,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    supportHandoffs: {
      id: 'support_handoffs.id',
      memberId: 'support_handoffs.member_id',
      publicResponse: 'support_handoffs.public_response',
      publicResponseAcknowledgedAt: 'support_handoffs.public_response_acknowledged_at',
      publicResponseAcknowledgedById: 'support_handoffs.public_response_acknowledged_by_id',
      publicResponseAcknowledgedVersion: 'support_handoffs.public_response_acknowledged_version',
      publicResponseVersion: 'support_handoffs.public_response_version',
      status: 'support_handoffs.status',
      tenantId: 'support_handoffs.tenant_id',
      updatedAt: 'support_handoffs.updated_at',
    },
    updateReturning,
    updateSet,
    updateWhere,
    withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  db: mocks.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => await cb(mocks.db)),
  eq: mocks.eq,
  sql: mocks.sql,
  supportHandoffs: mocks.supportHandoffs,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('drizzle-orm', () => ({
  inArray: mocks.inArray,
  isNotNull: mocks.isNotNull,
}));

export function memberSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
  return {
    user: {
      id: 'member-1',
      role: 'member',
      tenantId: 'tenant-1',
      ...overrides,
    },
  } as SupportHandoffSession;
}

export const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');

export { mocks };
