import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SupportHandoffSession } from './types';
import { createMemberSupportHandoffCore } from './create';

const mocks = vi.hoisted(() => {
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
      status: 'claims.status',
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
    ensureTenantId: vi.fn(() => 'tenant-1'),
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
  };
});

vi.mock('node:crypto', () => ({
  randomUUID: mocks.randomUUID,
}));

vi.mock('@interdomestik/database', () => ({
  claims: mocks.claims,
  db: mocks.db,
  desc: mocks.desc,
  eq: mocks.eq,
  subscriptions: mocks.subscriptions,
  supportHandoffs: mocks.supportHandoffs,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('drizzle-orm', () => ({
  and: mocks.and,
}));

function memberSession(overrides: Partial<SupportHandoffSession['user']> = {}) {
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

const ownedClaimContext = {
  branchId: 'branch-claim',
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  id: 'claim-1',
  staffId: null,
  status: 'submitted',
  statusUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
} as const;

describe('createMemberSupportHandoffCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReturnValue(mocks.selectChain);
    mocks.selectChain.from.mockReturnValue(mocks.selectChain);
    mocks.selectChain.where.mockReturnValue(mocks.selectChain);
    mocks.selectChain.orderBy.mockReturnValue(mocks.selectChain);
    mocks.selectChain.limit.mockResolvedValue([]);
    mocks.insertValues.mockResolvedValue(undefined);
  });

  it('rejects caller-supplied ownership and lifecycle fields before persistence', async () => {
    const result = await createMemberSupportHandoffCore({
      input: {
        branchId: 'branch-client',
        message: 'Please call me about this claim.',
        subject: 'Need help',
      },
      session: memberSession(),
    });

    expect(result).toEqual({ error: 'Ownership fields are server-derived', success: false });
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('rejects linked claims that are not owned by the member in the tenant', async () => {
    mocks.selectChain.limit.mockResolvedValueOnce([]);

    const result = await createMemberSupportHandoffCore({
      input: {
        claimId: 'claim-foreign',
        message: 'Please review this claim with me.',
        subject: 'Claim support',
      },
      session: memberSession(),
    });

    expect(result).toEqual({ error: 'Claim not found or access denied', success: false });
    expect(mocks.eq).toHaveBeenCalledWith('claims.user_id', 'member-1');
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it('fails closed when no branch can be derived for routing', async () => {
    mocks.selectChain.limit.mockResolvedValueOnce([]);

    const result = await createMemberSupportHandoffCore({
      input: {
        message: 'Please route this support request to staff.',
        subject: 'Routing support',
      },
      session: memberSession({ branchId: null }),
    });

    expect(result).toEqual({
      error: 'Branch is required for support routing',
      success: false,
    });
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['no source hint and no claim', {}, false, 'member_help'],
    ['no source hint and an owned claim', { claimId: 'claim-1' }, true, 'member_help'],
    [
      'a valid claim-detail hint and an owned claim',
      { claimId: 'claim-1', source: 'member_claim_detail', sourceClaimId: 'claim-1' },
      true,
      'member_claim_detail',
    ],
    [
      'a valid claim-detail hint without a claim',
      { source: 'member_claim_detail' },
      false,
      'member_help',
    ],
    [
      'a valid claim-detail hint without a source claim marker',
      { claimId: 'claim-1', source: 'member_claim_detail' },
      true,
      'member_help',
    ],
    [
      'a claim-detail hint for a different claim',
      { claimId: 'claim-1', source: 'member_claim_detail', sourceClaimId: 'claim-2' },
      true,
      'member_help',
    ],
    [
      'a forged source hint and an owned claim',
      { claimId: 'claim-1', source: 'admin_override', sourceClaimId: 'claim-1' },
      true,
      'member_help',
    ],
    [
      'a null source hint and an owned claim',
      { claimId: 'claim-1', source: null },
      true,
      'member_help',
    ],
  ])('derives source as %s', async (_name, sourceInput, hasOwnedClaim, expectedSource) => {
    if (hasOwnedClaim) {
      mocks.selectChain.limit.mockResolvedValueOnce([ownedClaimContext]);
    }

    const result = await createMemberSupportHandoffCore(
      {
        input: {
          message: 'Please help me understand the next support step.',
          subject: 'Source tracking',
          ...sourceInput,
        },
        session: memberSession(),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result.success).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: hasOwnedClaim ? 'claim-1' : null,
        source: expectedSource,
      })
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          claimId: hasOwnedClaim ? 'claim-1' : null,
          source: expectedSource,
        }),
      })
    );
  });

  it('persists a governed handoff with server-derived ownership and risk signals', async () => {
    mocks.selectChain.limit.mockResolvedValueOnce([ownedClaimContext]);

    const result = await createMemberSupportHandoffCore(
      {
        input: {
          claimId: 'claim-1',
          contactPreference: 'phone',
          message: 'Please help me understand the next step in this case.',
          subject: ' Need staff support ',
        },
        session: memberSession({ branchId: 'branch-session' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({
      data: { id: 'support_handoff_handoff-uuid' },
      success: true,
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch-claim',
        claimId: 'claim-1',
        contactPreference: 'phone',
        id: 'support_handoff_handoff-uuid',
        memberId: 'member-1',
        source: 'member_help',
        status: 'open',
        subject: 'Need staff support',
        tenantId: 'tenant-1',
        trustRisk: 'high',
        urgency: 'critical',
      })
    );
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'support_handoff.created',
        actorId: 'member-1',
        entityId: 'support_handoff_handoff-uuid',
        metadata: expect.objectContaining({
          source: 'member_help',
        }),
      })
    );
  });
});
