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
    status: 'claims.status',
    tenantId: 'claims.tenant_id',
    title: 'claims.title',
  },
  db: {
    select: vi.fn(),
  },
  desc: vi.fn(column => ({ column, op: 'desc' })),
  eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
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
    message: 'support_handoffs.message',
    publicResponse: 'support_handoffs.public_response',
    publicResponseAt: 'support_handoffs.public_response_at',
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
  isNotNull: mocks.isNotNull,
  isNull: mocks.isNull,
}));

import { buildStaffSupportHandoffQueueScope, getStaffSupportHandoffDetail } from './queue';

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

function mockSelectRows(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    where: vi.fn().mockReturnThis(),
  };
  mocks.db.select.mockReturnValue(query);
  return query;
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
});

describe('getStaffSupportHandoffDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns scoped detail fields with normalized lifecycle timestamps and actor names', async () => {
    const query = mockSelectRows([
      {
        acceptedAt: new Date('2026-05-04T08:30:00.000Z'),
        acceptedByName: 'Staff One',
        closedAt: null,
        closedByName: null,
        closeReason: null,
        contactPreference: 'phone',
        publicResponse: 'We are checking this.',
        publicResponseAt: new Date('2026-05-04T11:00:00.000Z'),
        publicResponseVersion: 2,
        reassignedAt: '2026-05-04T10:00:00.000Z',
        reassignedByName: 'Staff Two',
        reassignReason: 'Specialist needed',
        source: 'member_help',
      },
    ]);

    const detail = await getStaffSupportHandoffDetail({
      branchId: 'branch-1',
      handoffId: 'handoff-1',
      staffId: 'staff-1',
      tenantId: 'tenant-1',
      viewerRole: 'staff',
    });

    expect(mocks.db.select).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedAt: 'support_handoffs.accepted_at',
        acceptedByName: expect.any(String),
        closedAt: 'support_handoffs.closed_at',
        closedByName: expect.any(String),
        contactPreference: 'support_handoffs.contact_preference',
        publicResponse: 'support_handoffs.public_response',
        publicResponseAt: 'support_handoffs.public_response_at',
        publicResponseVersion: 'support_handoffs.public_response_version',
        source: 'support_handoffs.source',
      })
    );
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.id', 'handoff-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.staff_id', 'staff-1');
    expect(query.limit).toHaveBeenCalledWith(1);
    expect(detail).toEqual({
      acceptedAt: '2026-05-04T08:30:00.000Z',
      acceptedByName: 'Staff One',
      closedAt: null,
      closedByName: null,
      closeReason: null,
      contactPreference: 'phone',
      publicResponse: {
        publicResponse: 'We are checking this.',
        publicResponseAt: '2026-05-04T11:00:00.000Z',
        publicResponseVersion: 2,
      },
      reassignedAt: '2026-05-04T10:00:00.000Z',
      reassignedByName: 'Staff Two',
      reassignReason: 'Specialist needed',
      source: 'member_help',
    });
  });

  it('lets branch managers fetch branch-scoped detail without staff fallback filtering', async () => {
    mockSelectRows([]);

    await getStaffSupportHandoffDetail({
      branchId: 'branch-1',
      handoffId: 'handoff-1',
      staffId: 'manager-1',
      tenantId: 'tenant-1',
      viewerRole: 'branch_manager',
    });

    expect(mocks.eq).toHaveBeenCalledWith('support_handoffs.branch_id', 'branch-1');
    expect(mocks.eq).not.toHaveBeenCalledWith('support_handoffs.staff_id', 'manager-1');
  });

  it('returns null when the handoff is not visible in scope', async () => {
    mockSelectRows([]);

    await expect(
      getStaffSupportHandoffDetail({
        branchId: 'branch-1',
        handoffId: 'missing',
        staffId: 'staff-1',
        tenantId: 'tenant-1',
        viewerRole: 'staff',
      })
    ).resolves.toBeNull();
  });
});
