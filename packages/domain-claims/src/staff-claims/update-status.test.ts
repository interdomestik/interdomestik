import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { updateClaimStatusCore } from './update-status';

function createSelectChain() {
  return {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
}

const AUTHORIZED_AGREEMENT = {
  claimId: 'claim-1',
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-11T09:00:00Z'),
};

const STANDARD_SUBSCRIPTION = {
  id: 'sub-1',
  planId: 'standard',
  planKey: null,
  currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-12-31T23:59:59Z'),
};

const STANDARD_PLAN = { tier: 'standard' };

const mocks = vi.hoisted(() => {
  const claimSelectChain = createSelectChain();
  const agreementSelectChain = createSelectChain();
  const subscriptionSelectChain = createSelectChain();
  const membershipPlanSelectChain = createSelectChain();
  const serviceUsageExistsSelectChain = createSelectChain();
  const serviceUsageCountSelectChain = createSelectChain();
  const txInsertReturning = vi.fn();
  const txInsertOnConflictDoNothing = vi.fn(() => ({ returning: txInsertReturning }));
  const txInsertValues = vi.fn(() => ({
    onConflictDoNothing: txInsertOnConflictDoNothing,
  }));
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const transaction = vi.fn(async cb =>
    cb({
      insert: txInsert,
      update: txUpdate,
    })
  );

  return {
    db: {
      select: vi.fn(),
      transaction,
    },
    logAuditEvent: vi.fn(),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      staffId: 'claims.staff_id',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
    },
    claimEscalationAgreements: {
      claimId: 'claim_escalation_agreements.claim_id',
      paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
      signedAt: 'claim_escalation_agreements.signed_at',
    },
    subscriptions: {
      id: 'subscriptions.id',
      tenantId: 'subscriptions.tenant_id',
      userId: 'subscriptions.user_id',
      planId: 'subscriptions.plan_id',
      planKey: 'subscriptions.plan_key',
      currentPeriodStart: 'subscriptions.current_period_start',
      currentPeriodEnd: 'subscriptions.current_period_end',
    },
    membershipPlans: {
      id: 'membership_plans.id',
      tenantId: 'membership_plans.tenant_id',
      paddlePriceId: 'membership_plans.paddle_price_id',
      tier: 'membership_plans.tier',
    },
    serviceUsage: {
      id: 'service_usage.id',
      tenantId: 'service_usage.tenant_id',
      userId: 'service_usage.user_id',
      subscriptionId: 'service_usage.subscription_id',
      serviceCode: 'service_usage.service_code',
      usedAt: 'service_usage.used_at',
    },
    claimStageHistory: {
      id: 'claim_stage_history.id',
      tenantId: 'claim_stage_history.tenant_id',
      claimId: 'claim_stage_history.claim_id',
      fromStatus: 'claim_stage_history.from_status',
      toStatus: 'claim_stage_history.to_status',
      changedById: 'claim_stage_history.changed_by_id',
      changedByRole: 'claim_stage_history.changed_by_role',
      note: 'claim_stage_history.note',
      isPublic: 'claim_stage_history.is_public',
      createdAt: 'claim_stage_history.created_at',
    },
    claimStatusSchema: {
      safeParse: vi.fn((value: { status: string }) => ({
        success: true,
        data: value,
      })),
    },
    eq: vi.fn((left, right) => ({ op: 'eq', left, right })),
    or: vi.fn((...conditions) => ({ op: 'or', conditions })),
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: [...strings],
      values,
    })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    claimSelectChain,
    agreementSelectChain,
    subscriptionSelectChain,
    membershipPlanSelectChain,
    serviceUsageExistsSelectChain,
    serviceUsageCountSelectChain,
    txInsert,
    txInsertOnConflictDoNothing,
    txInsertReturning,
    txInsertValues,
    txUpdate,
    txUpdateSet,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claimStageHistory: mocks.claimStageHistory,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
  membershipPlans: mocks.membershipPlans,
  or: mocks.or,
  serviceUsage: mocks.serviceUsage,
  sql: mocks.sql,
  subscriptions: mocks.subscriptions,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

vi.mock('../validators/claims', () => ({
  claimStatusSchema: mocks.claimStatusSchema,
}));

function createSession(options: {
  userId: string;
  branchId?: string | null;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  const user = {
    id: options.userId,
    role: options.role ?? 'staff',
    tenantId: options.tenantId ?? 'tenant-1',
  };

  if (options.branchId === undefined) {
    return { user } as unknown as ClaimsSession;
  }

  return {
    user: { ...user, branchId: options.branchId },
  } as unknown as ClaimsSession;
}

function mockRecoverySelects(options?: {
  agreement?: Array<typeof AUTHORIZED_AGREEMENT>;
  claim?: Array<{ id: string; status: string; userId: string }>;
  existingClaimUsage?: Array<{ id: string }>;
  matterCount?: Array<{ count: number }>;
  plan?: Array<typeof STANDARD_PLAN>;
  subscription?: Array<typeof STANDARD_SUBSCRIPTION>;
}) {
  mocks.db.select
    .mockReturnValueOnce(mocks.claimSelectChain)
    .mockReturnValueOnce(mocks.agreementSelectChain)
    .mockReturnValueOnce(mocks.subscriptionSelectChain)
    .mockReturnValueOnce(mocks.serviceUsageExistsSelectChain);
  if ((options?.existingClaimUsage?.length ?? 0) === 0) {
    mocks.db.select
      .mockReturnValueOnce(mocks.membershipPlanSelectChain)
      .mockReturnValueOnce(mocks.serviceUsageCountSelectChain);
  }
  mocks.claimSelectChain.limit.mockResolvedValue(
    options?.claim ?? [{ id: 'claim-1', status: 'evaluation', userId: 'member-1' }]
  );
  mocks.agreementSelectChain.limit.mockResolvedValue(options?.agreement ?? [AUTHORIZED_AGREEMENT]);
  mocks.subscriptionSelectChain.limit.mockResolvedValue(
    options?.subscription ?? [STANDARD_SUBSCRIPTION]
  );
  if ((options?.existingClaimUsage?.length ?? 0) === 0) {
    mocks.membershipPlanSelectChain.limit.mockResolvedValue(options?.plan ?? [STANDARD_PLAN]);
    mocks.serviceUsageCountSelectChain.limit.mockResolvedValue(
      options?.matterCount ?? [{ count: 0 }]
    );
  }
  mocks.serviceUsageExistsSelectChain.limit.mockResolvedValue(options?.existingClaimUsage ?? []);
}

describe('staff updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
    mocks.subscriptionSelectChain.from.mockReturnValue(mocks.subscriptionSelectChain);
    mocks.subscriptionSelectChain.where.mockReturnValue(mocks.subscriptionSelectChain);
    mocks.membershipPlanSelectChain.from.mockReturnValue(mocks.membershipPlanSelectChain);
    mocks.membershipPlanSelectChain.where.mockReturnValue(mocks.membershipPlanSelectChain);
    mocks.serviceUsageExistsSelectChain.from.mockReturnValue(mocks.serviceUsageExistsSelectChain);
    mocks.serviceUsageExistsSelectChain.where.mockReturnValue(mocks.serviceUsageExistsSelectChain);
    mocks.serviceUsageCountSelectChain.from.mockReturnValue(mocks.serviceUsageCountSelectChain);
    mocks.serviceUsageCountSelectChain.where.mockReturnValue(mocks.serviceUsageCountSelectChain);
    mocks.txInsertReturning.mockResolvedValue([{ id: 'usage-claim-1' }]);
  });

  it('blocks negotiation until a signed, authorized escalation agreement exists', async () => {
    mockRecoverySelects({
      agreement: [],
      claim: [{ id: 'claim-1', status: 'evaluation', userId: 'member-1' }],
    });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error:
        'Signed escalation agreement and authorized payment collection are required before staff-led recovery can begin',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('blocks negotiation when payment authorization is still pending', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...AUTHORIZED_AGREEMENT,
          paymentAuthorizationState: 'pending',
        },
      ],
      claim: [{ id: 'claim-1', status: 'evaluation', userId: 'member-1' }],
    });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error:
        'Signed escalation agreement and authorized payment collection are required before staff-led recovery can begin',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('allows recovery status transition when an authorized agreement is present', async () => {
    mockRecoverySelects();
    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      note: 'member signed the agreement',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'negotiation',
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        fromStatus: 'evaluation',
        toStatus: 'negotiation',
      })
    );
  });

  it('skips allowance total and usage window queries when the claim already consumed a recovery matter', async () => {
    mockRecoverySelects({
      existingClaimUsage: [{ id: 'usage-claim-1' }],
    });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.membershipPlanSelectChain.limit).not.toHaveBeenCalled();
    expect(mocks.serviceUsageCountSelectChain.limit).not.toHaveBeenCalled();
    expect(mocks.txInsertOnConflictDoNothing).not.toHaveBeenCalled();
  });

  it('blocks staff-led recovery when annual matter allowance is exhausted without an override', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 2 }],
    });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error:
        'Matter allowance is exhausted. Record an override reason or upgrade the membership before staff-led recovery can begin.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalledWith(mocks.serviceUsage);
  });

  it('records matter consumption once when staff-led recovery starts within allowance', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 1 }],
    });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      note: 'Recovery accepted',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.serviceUsage);
    expect(mocks.txInsertOnConflictDoNothing).toHaveBeenCalledWith({
      target: [
        mocks.serviceUsage.tenantId,
        mocks.serviceUsage.subscriptionId,
        mocks.serviceUsage.serviceCode,
      ],
    });
    expect(mocks.txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceCode: 'staff_recovery_matter:claim-1',
        subscriptionId: 'sub-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
      })
    );
  });

  it('allows exhausted allowance when an explicit override reason is recorded', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 2 }],
    });

    const result = await updateClaimStatusCore(
      {
        claimId: 'claim-1',
        newStatus: 'negotiation',
        allowanceOverrideReason: 'Family upgrade is pending but recovery must start now',
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.serviceUsage);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          allowanceOverrideReason: 'Family upgrade is pending but recovery must start now',
        }),
      })
    );
  });

  it('uses the membership plan lookup when the subscription stores a Paddle price id', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 2 }],
      plan: [{ tier: 'family' }],
      subscription: [
        {
          ...STANDARD_SUBSCRIPTION,
          planId: 'pri_01HK37S5T9XQ2Y8Z4W6N0VJ3AB',
          planKey: null,
        },
      ],
    });

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.serviceUsage);
  });

  it('treats a conflicting recovery usage insert as an already consumed matter', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 1 }],
    });
    mocks.txInsertReturning.mockResolvedValueOnce([]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsertOnConflictDoNothing).toHaveBeenCalledWith({
      target: [
        mocks.serviceUsage.tenantId,
        mocks.serviceUsage.subscriptionId,
        mocks.serviceUsage.serviceCode,
      ],
    });
  });

  it('requires an explicit reason when staff reject a recovery matter', async () => {
    mocks.db.select.mockReturnValueOnce(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { id: 'claim-1', status: 'negotiation', userId: 'member-1' },
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'rejected',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Decline reason is required when staff reject a recovery matter.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it('records an audit event when staff decline a recovery matter', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mocks.db.select.mockReturnValueOnce(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([{ id: 'claim-1', status: 'negotiation' }]);

    const result = await updateClaimStatusCore(
      {
        claimId: 'claim-1',
        newStatus: 'rejected',
        note: 'Declined after review',
        requestHeaders,
        session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.status_changed',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: 'claim-1',
        entityType: 'claim',
        headers: requestHeaders,
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          decisionNextStatus: 'rejected',
          decisionReason: 'Declined after review',
          decisionType: 'declined',
          oldStatus: 'negotiation',
          newStatus: 'rejected',
          note: 'Declined after review',
        }),
      })
    );
  });
});
