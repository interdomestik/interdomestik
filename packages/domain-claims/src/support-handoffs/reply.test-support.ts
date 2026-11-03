import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { SupportHandoffSession } from './types';

const mocks: {
  and: Mock;
  db: any;
  ensureTenantId: Mock;
  eq: Mock;
  inArray: Mock;
  isNotNull: Mock;
  isNull: Mock;
  logAuditEvent: Mock;
  selectFrom: Mock;
  selectLimit: Mock;
  selectWhere: Mock;
  sql: Mock;
  supportHandoffs: {
    id: string;
    memberId: string;
    memberReply: string;
    memberReplyAt: string;
    memberReplyResponseVersion: string;
    publicResponse: string;
    publicResponseAcknowledgedAt: string;
    publicResponseAcknowledgedById: string;
    publicResponseAcknowledgedVersion: string;
    publicResponseVersion: string;
    status: string;
    tenantId: string;
    updatedAt: string;
  };
  updateReturning: Mock;
  updateSet: Mock;
  updateWhere: Mock;
  withTenant: Mock;
} = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn();
  const updateSet = vi.fn();
  const selectLimit = vi.fn();
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const column = (name: string) => `support_handoffs.${name}`;

  return {
    and: vi.fn((...conditions) => ({ conditions, predicate: 'and' })),
    db: Object.fromEntries([
      ['select', vi.fn(() => ({ from: selectFrom }))],
      ['update', vi.fn(() => ({ set: updateSet }))],
    ]),
    ensureTenantId: vi.fn().mockReturnValue('tenant-1'),
    eq: vi.fn((left, right) => ({ left, predicate: 'eq', right })),
    inArray: vi.fn((left, right) => ({ left, predicate: 'inArray', right })),
    isNotNull: vi.fn(columnName => ({ column: columnName, predicate: 'isNotNull' })),
    isNull: vi.fn(columnName => ({ column: columnName, predicate: 'isNull' })),
    logAuditEvent: vi.fn(),
    selectFrom,
    selectLimit,
    selectWhere,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values })),
    supportHandoffs: {
      id: column('id'),
      memberId: column('member_id'),
      memberReply: column('member_reply'),
      memberReplyAt: column('member_reply_at'),
      memberReplyResponseVersion: column('member_reply_response_version'),
      publicResponse: column('public_response'),
      publicResponseAcknowledgedAt: column('public_response_acknowledged_at'),
      publicResponseAcknowledgedById: column('public_response_acknowledged_by_id'),
      publicResponseAcknowledgedVersion: column('public_response_acknowledged_version'),
      publicResponseVersion: column('public_response_version'),
      status: column('status'),
      tenantId: column('tenant_id'),
      updatedAt: column('updated_at'),
    },
    updateReturning,
    updateSet,
    updateWhere,
    withTenant: vi.fn((_tenantId, _tenantColumn, condition) => ({ condition, tenantScoped: true })),
  };
});
function databaseExports(): {
  and: Mock;
  db: any;
  withTenantContext: Mock;
  eq: Mock;
  sql: Mock;
  supportHandoffs: {
    id: string;
    memberId: string;
    memberReply: string;
    memberReplyAt: string;
    memberReplyResponseVersion: string;
    publicResponse: string;
    publicResponseAcknowledgedAt: string;
    publicResponseAcknowledgedById: string;
    publicResponseAcknowledgedVersion: string;
    publicResponseVersion: string;
    status: string;
    tenantId: string;
    updatedAt: string;
  };
} {
  return {
    and: mocks.and,
    db: mocks.db,
    withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) => await cb(mocks.db)),
    eq: mocks.eq,
    sql: mocks.sql,
    supportHandoffs: mocks.supportHandoffs,
  };
}
function tenantSecurityExports(): { withTenant: Mock } {
  return { withTenant: mocks.withTenant };
}
function sharedAuthExports(): { ensureTenantId: Mock } {
  return { ensureTenantId: mocks.ensureTenantId };
}
function drizzleExports(): { inArray: Mock; isNotNull: Mock; isNull: Mock } {
  return { inArray: mocks.inArray, isNotNull: mocks.isNotNull, isNull: mocks.isNull };
}
vi.mock('@interdomestik/database', databaseExports);
vi.mock('@interdomestik/database/tenant-security', tenantSecurityExports);
vi.mock('@interdomestik/shared-auth', sharedAuthExports);
vi.mock('drizzle-orm', drizzleExports);
function memberSession(overrides: Partial<SupportHandoffSession['user']> = {}): {
  user: {
    branchId?: string | null;
    id: string;
    role?: string | null;
    tenantId?: string | null;
    accessTenantId?: string | null;
    email?: string | null;
  };
} {
  return {
    user: { id: 'member-1', role: 'member', tenantId: 'tenant-1', ...overrides },
  } as SupportHandoffSession;
}

export {
  mocks,
  databaseExports,
  tenantSecurityExports,
  sharedAuthExports,
  drizzleExports,
  memberSession,
};
