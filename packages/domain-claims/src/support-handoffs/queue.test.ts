import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  withTenantContext: vi.fn(async (_context, action) => action(mocks.db)),
  and: mocks.and,
  branches: mocks.branches,
  claims: mocks.claims,
  db: mocks.db,
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

import { buildStaffSupportHandoffQueueScope } from './queue';

type QueueScopeArgs = Parameters<typeof buildStaffSupportHandoffQueueScope>[0];

function buildScope(overrides: Partial<QueueScopeArgs> = {}) {
  const base: QueueScopeArgs = {
    assignment: 'all',
    branchId: 'branch-1',
    staffId: 'staff-1',
    status: 'open',
    tenantId: 'tenant-1',
    viewerRole: 'staff',
  };
  return buildStaffSupportHandoffQueueScope({ ...base, ...overrides });
}

describe('buildStaffSupportHandoffQueueScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes staff all-queue reads to the staff branch and own-or-unassigned handoffs', () => {
    const scope = buildScope({ assignment: 'all' });

    expect(scope).toEqual({ condition: expect.any(Object), scoped: true });
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'open');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-1',
      'support_handoffs.tenant_id',
      expect.any(Object)
    );
  });

  it('lets branch managers see the whole branch without staff fallback filtering', () => {
    buildScope({
      assignment: 'all',
      staffId: 'manager-1',
      viewerRole: 'branch_manager',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.staff_id', 'manager-1');
    expect(mocks.isNull).not.toHaveBeenCalledWith('support_handoffs.staff_id');
  });

  it('falls back to own-or-unassigned filtering for branch managers without branch scope', () => {
    buildScope({
      branchId: null,
      staffId: 'manager-1',
      viewerRole: 'branch_manager',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'manager-1');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
  });

  it('supports mine, unassigned, claim-link, urgency, and search filters', () => {
    buildScope({
      assignment: 'mine',
      claimLink: 'linked',
      search: '  member   query  ',
      urgency: 'critical',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.urgency', 'critical');
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.claim_id');
    expect(mocks.ilike).toHaveBeenCalledWith('support_handoffs.subject', '%member query%');

    vi.clearAllMocks();
    buildScope({ assignment: 'unassigned', claimLink: 'unlinked' });

    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.staff_id');
    expect(mocks.isNull).toHaveBeenCalledWith('support_handoffs.claim_id');
  });

  it('supports filtering to handoffs with current-cycle member replies', () => {
    buildScope({ attention: 'needs_follow_up' });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.gt).toHaveBeenCalledWith('support_handoffs.public_response_version', 0);
    expect(mocks.isNotNull).toHaveBeenCalledWith('support_handoffs.member_reply_at');
    expect(mocks.eq).toHaveBeenCalledWith(
      'support_handoffs.member_reply_response_version',
      'support_handoffs.public_response_version'
    );
  });

  it('lets the needs-follow-up attention filter override contradictory status input', () => {
    buildScope({ attention: 'needs_follow_up', status: 'closed' });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.status', 'accepted');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.status', 'closed');
  });
});
