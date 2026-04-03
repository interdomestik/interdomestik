import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import type {
  PaymentAuthorizationState,
  RecoveryDeclineReasonCode,
  RecoveryDecisionType,
} from './types';
import { updateClaimStatusCore } from './update-status';

function createSelectChain() {
  return {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
}

type MockRecoveryAgreement = {
  claimId: string;
  decisionType: RecoveryDecisionType | null;
  declineReasonCode: RecoveryDeclineReasonCode | null;
  decisionNextStatus: 'negotiation' | 'court' | null;
  decisionReason: string | null;
  feePercentage: number | null;
  legalActionCapPercentage: number | null;
  minimumFee: string | null;
  paymentAuthorizationState: PaymentAuthorizationState | null;
  signedAt: Date | null;
  acceptedAt: Date | null;
  successFeeRecoveredAmount: string | null;
  successFeeCurrencyCode: string | null;
  successFeeAmount: string | null;
  successFeeCollectionMethod: 'deduction' | 'payment_method_charge' | 'invoice' | null;
  successFeeDeductionAllowed: boolean | null;
  successFeeHasStoredPaymentMethod: boolean | null;
  successFeeInvoiceDueAt: Date | null;
  successFeeResolvedAt: Date | null;
  successFeeSubscriptionId: string | null;
  termsVersion: string | null;
};

const READY_ACCEPTED_RECOVERY_RECORD: MockRecoveryAgreement = {
  claimId: 'claim-1',
  decisionType: 'accepted',
  declineReasonCode: null,
  decisionNextStatus: 'negotiation',
  decisionReason: 'Clear insurer liability and member approval confirmed.',
  feePercentage: 15,
  legalActionCapPercentage: 25,
  minimumFee: '25.00',
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-11T09:00:00Z'),
  acceptedAt: new Date('2026-03-11T09:00:00Z'),
  successFeeRecoveredAmount: '1000.00',
  successFeeCurrencyCode: 'EUR',
  successFeeAmount: '150.00',
  successFeeCollectionMethod: 'payment_method_charge',
  successFeeDeductionAllowed: false,
  successFeeHasStoredPaymentMethod: true,
  successFeeInvoiceDueAt: null,
  successFeeResolvedAt: new Date('2026-03-12T09:00:00Z'),
  successFeeSubscriptionId: 'sub-1',
  termsVersion: '2026-03-v1',
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
  const txSelectChain = createSelectChain();
  const txInsertReturning = vi.fn();
  const txInsertOnConflictDoNothing = vi.fn(() => ({ returning: txInsertReturning }));
  const txInsertValues = vi.fn(() => ({
    onConflictDoNothing: txInsertOnConflictDoNothing,
  }));
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txSelect = vi.fn(() => txSelectChain);
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const transaction = vi.fn(async cb =>
    cb({
      insert: txInsert,
      select: txSelect,
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
      category: 'claims.category',
      staffId: 'claims.staff_id',
      assignedAt: 'claims.assigned_at',
      assignedById: 'claims.assigned_by_id',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
      userId: 'claims.user_id',
    },
    claimEscalationAgreements: {
      claimId: 'claim_escalation_agreements.claim_id',
      decisionType: 'claim_escalation_agreements.decision_type',
      declineReasonCode: 'claim_escalation_agreements.decline_reason_code',
      decisionNextStatus: 'claim_escalation_agreements.decision_next_status',
      decisionReason: 'claim_escalation_agreements.decision_reason',
      feePercentage: 'claim_escalation_agreements.fee_percentage',
      legalActionCapPercentage: 'claim_escalation_agreements.legal_action_cap_percentage',
      minimumFee: 'claim_escalation_agreements.minimum_fee',
      paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
      signedAt: 'claim_escalation_agreements.signed_at',
      acceptedAt: 'claim_escalation_agreements.accepted_at',
      successFeeRecoveredAmount: 'claim_escalation_agreements.success_fee_recovered_amount',
      successFeeCurrencyCode: 'claim_escalation_agreements.success_fee_currency_code',
      successFeeAmount: 'claim_escalation_agreements.success_fee_amount',
      successFeeCollectionMethod: 'claim_escalation_agreements.success_fee_collection_method',
      successFeeDeductionAllowed: 'claim_escalation_agreements.success_fee_deduction_allowed',
      successFeeHasStoredPaymentMethod:
        'claim_escalation_agreements.success_fee_has_stored_payment_method',
      successFeeInvoiceDueAt: 'claim_escalation_agreements.success_fee_invoice_due_at',
      successFeeResolvedAt: 'claim_escalation_agreements.success_fee_resolved_at',
      successFeeSubscriptionId: 'claim_escalation_agreements.success_fee_subscription_id',
      termsVersion: 'claim_escalation_agreements.terms_version',
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
    txSelect,
    txSelectChain,
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
  agreement?: Array<MockRecoveryAgreement>;
  claim?: Array<{
    id: string;
    status: string;
    userId: string;
    category: string;
    staffId?: string | null;
  }>;
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
    options?.claim ?? [
      {
        id: 'claim-1',
        status: 'evaluation',
        userId: 'member-1',
        category: 'vehicle',
        staffId: null,
      },
    ]
  );
  mocks.agreementSelectChain.limit.mockResolvedValue(
    options?.agreement ?? [READY_ACCEPTED_RECOVERY_RECORD]
  );
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

async function runNegotiationUpdate(
  overrides: Partial<Parameters<typeof updateClaimStatusCore>[0]> = {},
  deps?: Parameters<typeof updateClaimStatusCore>[1]
) {
  return updateClaimStatusCore(
    {
      claimId: 'claim-1',
      newStatus: 'negotiation',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
      ...overrides,
    },
    deps
  );
}

function expectBlockedStatusChange(
  result: Awaited<ReturnType<typeof updateClaimStatusCore>>,
  error: string
) {
  expect(result).toEqual({
    success: false,
    error,
  });
  expect(mocks.txUpdate).not.toHaveBeenCalled();
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
    mocks.txSelectChain.from.mockReturnValue(mocks.txSelectChain);
    mocks.txSelectChain.where.mockReturnValue(mocks.txSelectChain);
    mocks.txInsertReturning.mockResolvedValue([{ id: 'usage-claim-1' }]);
  });

  it.each([
    {
      agreement: [] as Array<MockRecoveryAgreement>,
      title: 'blocks negotiation until a recovery decision is recorded',
    },
    {
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          decisionType: null,
        },
      ],
      title: 'blocks negotiation until staff explicitly accept the recovery decision',
    },
  ])('$title', async ({ agreement }) => {
    mockRecoverySelects({ agreement });

    const result = await runNegotiationUpdate();

    expectBlockedStatusChange(
      result,
      'Staff must accept the recovery decision before staff-led recovery can begin.'
    );
  });

  it('blocks negotiation until the accepted escalation agreement is complete', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          paymentAuthorizationState: 'pending',
          signedAt: null,
        },
      ],
      claim: [{ id: 'claim-1', status: 'evaluation', userId: 'member-1', category: 'vehicle' }],
    });

    const result = await runNegotiationUpdate();

    expectBlockedStatusChange(
      result,
      'Save the accepted escalation agreement before staff-led recovery can begin.'
    );
  });

  it('blocks negotiation until the accepted case has a saved collection path', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          successFeeRecoveredAmount: null,
          successFeeCurrencyCode: null,
          successFeeAmount: null,
          successFeeCollectionMethod: null,
          successFeeDeductionAllowed: null,
          successFeeHasStoredPaymentMethod: null,
          successFeeInvoiceDueAt: null,
          successFeeResolvedAt: null,
          successFeeSubscriptionId: null,
        },
      ],
    });

    const result = await runNegotiationUpdate();

    expectBlockedStatusChange(
      result,
      'Save the success-fee collection path before staff-led recovery can begin.'
    );
  });

  it('blocks negotiation for guidance-only matters before staff-led recovery can begin', async () => {
    mockRecoverySelects({
      claim: [{ id: 'claim-1', status: 'evaluation', userId: 'member-1', category: 'travel' }],
    });

    const result = await runNegotiationUpdate();

    expectBlockedStatusChange(
      result,
      'This matter stays guidance-only or referral-only under the current launch scope and cannot move into staff-led recovery or success-fee handling.'
    );
  });

  it('allows recovery status transition when an accepted case has a valid invoice fallback path', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          paymentAuthorizationState: 'revoked',
          successFeeCollectionMethod: 'invoice',
          successFeeHasStoredPaymentMethod: false,
          successFeeInvoiceDueAt: new Date('2026-03-19T09:00:00Z'),
          successFeeSubscriptionId: null,
        },
      ],
    });
    const result = await runNegotiationUpdate({
      note: 'member signed the agreement',
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

  it('auto-assigns the acting staff member when an unassigned claim is triaged', async () => {
    mocks.db.select.mockReturnValueOnce(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      {
        id: 'claim-1',
        status: 'submitted',
        userId: 'member-1',
        category: 'vehicle',
        staffId: null,
      },
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'verification',
      note: 'Initial staff triage',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'verification',
        staffId: expect.objectContaining({ op: 'sql' }),
        assignedAt: expect.objectContaining({ op: 'sql' }),
        assignedById: expect.objectContaining({ op: 'sql' }),
        updatedAt: expect.any(Date),
      })
    );
    expect(mocks.sql).toHaveBeenNthCalledWith(
      1,
      expect.any(Array),
      mocks.claims.staffId,
      'staff-1'
    );
    expect(mocks.sql).toHaveBeenNthCalledWith(
      2,
      expect.any(Array),
      mocks.claims.assignedAt,
      expect.any(Date)
    );
    expect(mocks.sql).toHaveBeenNthCalledWith(
      3,
      expect.any(Array),
      mocks.claims.assignedById,
      'staff-1'
    );
  });

  it('blocks recovery status transition after staff accept the recovery decision when agreement terms are still missing', async () => {
    mockRecoverySelects({
      agreement: [
        {
          ...READY_ACCEPTED_RECOVERY_RECORD,
          feePercentage: null,
          legalActionCapPercentage: null,
          minimumFee: null,
          paymentAuthorizationState: 'pending',
          signedAt: null,
          termsVersion: null,
        },
      ],
    });

    const result = await runNegotiationUpdate({
      note: 'Staff accepted the recovery decision and can now start work.',
    });

    expectBlockedStatusChange(
      result,
      'Save the accepted escalation agreement before staff-led recovery can begin.'
    );
  });

  it('skips allowance total and usage window queries when the claim already consumed a recovery matter', async () => {
    mockRecoverySelects({
      existingClaimUsage: [{ id: 'usage-claim-1' }],
    });

    const result = await runNegotiationUpdate();

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.membershipPlanSelectChain.limit).not.toHaveBeenCalled();
    expect(mocks.serviceUsageCountSelectChain.limit).not.toHaveBeenCalled();
    expect(mocks.txInsertOnConflictDoNothing).not.toHaveBeenCalled();
  });

  it('blocks staff-led recovery when annual matter allowance is exhausted without an override', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 2 }],
    });

    const result = await runNegotiationUpdate();

    expectBlockedStatusChange(
      result,
      'Matter allowance is exhausted. Record an override reason or upgrade the membership before staff-led recovery can begin.'
    );
    expect(mocks.txInsert).not.toHaveBeenCalledWith(mocks.serviceUsage);
  });

  it('records matter consumption once when staff-led recovery starts within allowance', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 1 }],
    });

    const result = await runNegotiationUpdate({
      note: 'Recovery accepted',
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

    const result = await runNegotiationUpdate(
      {
        allowanceOverrideReason: 'Family upgrade is pending but recovery must start now',
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

    const result = await runNegotiationUpdate();

    expect(result).toEqual({ success: true, error: undefined });
    expect(mocks.txInsert).toHaveBeenCalledWith(mocks.serviceUsage);
  });

  it('treats a conflicting recovery usage insert as an already consumed matter', async () => {
    mockRecoverySelects({
      matterCount: [{ count: 1 }],
    });
    mocks.txInsertReturning.mockResolvedValueOnce([]);

    const result = await runNegotiationUpdate();

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
      { id: 'claim-1', status: 'negotiation', userId: 'member-1', category: 'vehicle' },
    ]);

    const result = await updateClaimStatusCore({
      claimId: 'claim-1',
      newStatus: 'rejected',
      session: createSession({ userId: 'staff-1', branchId: 'branch-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Decline reason category is required when staff reject a recovery matter.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it('records an audit event when staff decline a recovery matter', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mocks.db.select.mockReturnValueOnce(mocks.claimSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { id: 'claim-1', status: 'negotiation', userId: 'member-1', category: 'vehicle' },
    ]);
    mocks.txSelectChain.limit.mockResolvedValue([]);

    const result = await updateClaimStatusCore(
      {
        claimId: 'claim-1',
        newStatus: 'rejected',
        declineReasonCode: 'no_monetary_recovery_path',
        decisionExplanation: 'Declined after review',
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
          declineReasonCode: 'no_monetary_recovery_path',
          decisionReason: 'Declined after review',
          decisionType: 'declined',
          oldStatus: 'negotiation',
          newStatus: 'rejected',
          note: 'This matter does not currently show a clear monetary recovery path for staff-led recovery.',
        }),
      })
    );
  });
});
