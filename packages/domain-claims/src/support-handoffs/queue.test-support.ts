import type { Mock } from 'vitest';
import { vi } from 'vitest';

const mocks: {
  resolveMembership: Mock;
  inArray: Mock;
  and: Mock;
  branches: { id: string; name: string; tenantId: string };
  claims: {
    claimNumber: string;
    id: string;
    caseLifecycleState: string;
    recoveryLifecycleState: string;
    tenantId: string;
    title: string;
  };
  db: { select: Mock };
  desc: Mock;
  eq: Mock;
  gt: Mock;
  ilike: Mock;
  isNotNull: Mock;
  isNull: Mock;
  membershipPlans: { id: string; name: string; tenantId: string };
  or: Mock;
  subscriptions: {
    agentId: string;
    planKey: string;
    status: string;
    tenantId: string;
    userId: string;
  };
  supportHandoffs: {
    acceptedAt: string;
    acceptedById: string;
    branchId: string;
    claimId: string;
    closedAt: string;
    closedById: string;
    closeReason: string;
    contactPreference: string;
    createdAt: string;
    id: string;
    lifecycleVersion: string;
    memberId: string;
    memberReply: string;
    memberReplyAt: string;
    memberReplyResponseVersion: string;
    message: string;
    publicResponse: string;
    publicResponseAt: string;
    publicResponseAcknowledgedAt: string;
    publicResponseAcknowledgedById: string;
    publicResponseAcknowledgedVersion: string;
    publicResponseVersion: string;
    reassignedAt: string;
    reassignedById: string;
    reassignReason: string;
    source: string;
    staffId: string;
    status: string;
    subject: string;
    tenantId: string;
    trustRisk: string;
    updatedAt: string;
    urgency: string;
  };
  user: { email: string; id: string; memberNumber: string; name: string; tenantId: string };
  withTenant: Mock;
} = vi.hoisted(() => ({
  resolveMembership: vi.fn(async () => new Map()),
  inArray: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
  branches: {
    id: 'branches.id',
    name: 'branches.name',
    tenantId: 'branches.tenant_id',
  },
  claims: {
    claimNumber: 'claims.claim_number',
    id: 'claims.id',
    caseLifecycleState: 'claims.case_lifecycle_state',
    recoveryLifecycleState: 'claims.recovery_lifecycle_state',
    tenantId: 'claims.tenant_id',
    title: 'claims.title',
  },
  db: {
    select: vi.fn(),
  },
  desc: vi.fn(column => ({ column, op: 'desc' })),
  eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
  gt: vi.fn((left, right) => ({ left, op: 'gt', right })),
  ilike: vi.fn((left, right) => ({ left, op: 'ilike', right })),
  isNotNull: vi.fn(column => ({ column, op: 'isNotNull' })),
  isNull: vi.fn(column => ({ column, op: 'isNull' })),
  membershipPlans: {
    id: 'membership_plans.id',
    name: 'membership_plans.name',
    tenantId: 'membership_plans.tenant_id',
  },
  or: vi.fn((...conditions) => ({ conditions, op: 'or' })),
  subscriptions: {
    agentId: 'subscriptions.agent_id',
    planKey: 'subscriptions.plan_key',
    status: 'subscriptions.status',
    tenantId: 'subscriptions.tenant_id',
    userId: 'subscriptions.user_id',
  },
  supportHandoffs: {
    acceptedAt: 'support_handoffs.accepted_at',
    acceptedById: 'support_handoffs.accepted_by_id',
    branchId: 'support_handoffs.branch_id',
    claimId: 'support_handoffs.claim_id',
    closedAt: 'support_handoffs.closed_at',
    closedById: 'support_handoffs.closed_by_id',
    closeReason: 'support_handoffs.close_reason',
    contactPreference: 'support_handoffs.contact_preference',
    createdAt: 'support_handoffs.created_at',
    id: 'support_handoffs.id',
    lifecycleVersion: 'support_handoffs.lifecycle_version',
    memberId: 'support_handoffs.member_id',
    memberReply: 'support_handoffs.member_reply',
    memberReplyAt: 'support_handoffs.member_reply_at',
    memberReplyResponseVersion: 'support_handoffs.member_reply_response_version',
    message: 'support_handoffs.message',
    publicResponse: 'support_handoffs.public_response',
    publicResponseAt: 'support_handoffs.public_response_at',
    publicResponseAcknowledgedAt: 'support_handoffs.public_response_acknowledged_at',
    publicResponseAcknowledgedById: 'support_handoffs.public_response_acknowledged_by_id',
    publicResponseAcknowledgedVersion: 'support_handoffs.public_response_acknowledged_version',
    publicResponseVersion: 'support_handoffs.public_response_version',
    reassignedAt: 'support_handoffs.reassigned_at',
    reassignedById: 'support_handoffs.reassigned_by_id',
    reassignReason: 'support_handoffs.reassign_reason',
    source: 'support_handoffs.source',
    staffId: 'support_handoffs.staff_id',
    status: 'support_handoffs.status',
    subject: 'support_handoffs.subject',
    tenantId: 'support_handoffs.tenant_id',
    trustRisk: 'support_handoffs.trust_risk',
    updatedAt: 'support_handoffs.updated_at',
    urgency: 'support_handoffs.urgency',
  },
  user: {
    email: 'user.email',
    id: 'user.id',
    memberNumber: 'user.member_number',
    name: 'user.name',
    tenantId: 'user.tenant_id',
  },
  withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
}));
vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  inArray: mocks.inArray,
  branches: mocks.branches,
  claims: mocks.claims,
  db: mocks.db,
  withTenantContext: vi.fn(
    async (_ctx: unknown, cb: (tx: unknown) => unknown) => await cb(mocks.db)
  ),
  desc: mocks.desc,
  eq: mocks.eq,
  ilike: mocks.ilike,
  membershipPlans: mocks.membershipPlans,
  or: mocks.or,
  subscriptions: mocks.subscriptions,
  supportHandoffs: mocks.supportHandoffs,
  user: mocks.user,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));
vi.mock('drizzle-orm', () => ({
  aliasedTable: vi.fn((table, alias) => ({ ...table, alias })),
  gt: mocks.gt,
  isNotNull: mocks.isNotNull,
  isNull: mocks.isNull,
  sql: vi.fn((strings, ...values) => ({ op: 'sql', strings, values })),
}));

vi.mock('@interdomestik/domain-membership-billing/sponsor-coverage', () => ({
  resolveEffectiveMembership: mocks.resolveMembership,
}));

export { mocks };
