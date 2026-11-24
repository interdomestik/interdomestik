import type { Mock } from 'vitest';
import { vi } from 'vitest';

const mocks: {
  and: Mock;
  db: { insert: Mock; select: Mock; update: Mock };
  desc: Mock;
  ensureTenantId: Mock;
  eq: Mock;
  inArray: Mock;
  insertConflict: Mock;
  insertValues: Mock;
  isNotNull: Mock;
  logAuditEvent: Mock;
  enqueue: Mock;
  transaction: Mock;
  selectFrom: Mock;
  selectLock: Mock;
  selectLimit: Mock;
  selectOrderBy: Mock;
  selectWhere: Mock;
  sql: Mock;
  supportHandoffFirstResponses: {
    firstPublicResponseAt: string;
    handoffId: string;
    tenantId: string;
  };
  supportHandoffs: {
    branchId: string;
    claimId: string;
    id: string;
    memberId: string;
    memberReply: string;
    memberReplyAt: string;
    memberReplyResponseVersion: string;
    publicResponse: string;
    publicResponseAt: string;
    publicResponseAcknowledgedAt: string;
    publicResponseAcknowledgedById: string;
    publicResponseAcknowledgedVersion: string;
    publicResponseById: string;
    publicResponseVersion: string;
    staffId: string;
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
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
  const selectWhere = vi.fn(() => ({ orderBy: selectOrderBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const insertConflict = vi.fn(() => Promise.resolve());
  const insertValues = vi.fn(() => ({ onConflictDoNothing: insertConflict }));

  return {
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    db: {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
    },
    desc: vi.fn(column => ({ column, op: 'desc' })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    inArray: vi.fn((left, right) => ({ left, op: 'inArray', right })),
    insertConflict,
    insertValues,
    isNotNull: vi.fn(column => ({ column, op: 'isNotNull' })),
    logAuditEvent: vi.fn(),
    enqueue: vi.fn(),
    transaction: vi.fn(),
    selectFrom,
    selectLock: vi.fn(),
    selectLimit,
    selectOrderBy,
    selectWhere,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    })),
    supportHandoffFirstResponses: {
      firstPublicResponseAt: 'support_handoff_first_responses.first_public_response_at',
      handoffId: 'support_handoff_first_responses.handoff_id',
      tenantId: 'support_handoff_first_responses.tenant_id',
    },
    supportHandoffs: {
      branchId: 'support_handoffs.branch_id',
      claimId: 'support_handoffs.claim_id',
      id: 'support_handoffs.id',
      memberId: 'support_handoffs.member_id',
      memberReply: 'support_handoffs.member_reply',
      memberReplyAt: 'support_handoffs.member_reply_at',
      memberReplyResponseVersion: 'support_handoffs.member_reply_response_version',
      publicResponse: 'support_handoffs.public_response',
      publicResponseAt: 'support_handoffs.public_response_at',
      publicResponseAcknowledgedAt: 'support_handoffs.public_response_acknowledged_at',
      publicResponseAcknowledgedById: 'support_handoffs.public_response_acknowledged_by_id',
      publicResponseAcknowledgedVersion: 'support_handoffs.public_response_acknowledged_version',
      publicResponseById: 'support_handoffs.public_response_by_id',
      publicResponseVersion: 'support_handoffs.public_response_version',
      staffId: 'support_handoffs.staff_id',
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
  withTenantContext: mocks.transaction,
  desc: mocks.desc,
  eq: mocks.eq,
  sql: mocks.sql,
  supportHandoffFirstResponses: mocks.supportHandoffFirstResponses,
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

vi.mock('@interdomestik/domain-communications/notification-deliveries', () => ({
  enqueueSupportHandoffResponseNotification: mocks.enqueue,
}));

export { mocks };
