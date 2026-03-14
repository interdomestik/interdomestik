import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const claimChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  const agentChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };

  return {
    claimChain,
    agentChain,
    db: { select: vi.fn() },
    getMatterAllowanceVisibility: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      claimNumber: 'claims.claim_number',
      status: 'claims.status',
      updatedAt: 'claims.updated_at',
      createdAt: 'claims.created_at',
      staffId: 'claims.staff_id',
      userId: 'claims.user_id',
      agentId: 'claims.agent_id',
    },
    claimEscalationAgreements: {
      claimId: 'claim_escalation_agreements.claim_id',
      decisionNextStatus: 'claim_escalation_agreements.decision_next_status',
      decisionReason: 'claim_escalation_agreements.decision_reason',
      feePercentage: 'claim_escalation_agreements.fee_percentage',
      minimumFee: 'claim_escalation_agreements.minimum_fee',
      legalActionCapPercentage: 'claim_escalation_agreements.legal_action_cap_percentage',
      paymentAuthorizationState: 'claim_escalation_agreements.payment_authorization_state',
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
      signedAt: 'claim_escalation_agreements.signed_at',
      acceptedAt: 'claim_escalation_agreements.accepted_at',
    },
    user: {
      id: 'user.id',
      name: 'user.name',
      memberNumber: 'user.member_number',
    },
    eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
  };
});

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  user: mocks.user,
  eq: mocks.eq,
  and: mocks.and,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('./matter-allowance', () => ({
  getMatterAllowanceVisibilityForUser: mocks.getMatterAllowanceVisibility,
}));

import { getStaffClaimDetail } from './get-staff-claim-detail';

describe('getStaffClaimDetail', () => {
  beforeEach(() => {
    mocks.db.select.mockReset();
    mocks.db.select.mockReturnValueOnce(mocks.claimChain).mockReturnValueOnce(mocks.agentChain);
    mocks.getMatterAllowanceVisibility.mockResolvedValue(null);
    mocks.claimChain.from.mockReturnValue(mocks.claimChain);
    mocks.claimChain.leftJoin.mockReturnValue(mocks.claimChain);
    mocks.claimChain.where.mockReturnValue(mocks.claimChain);
    mocks.agentChain.from.mockReturnValue(mocks.agentChain);
    mocks.agentChain.where.mockReturnValue(mocks.agentChain);
  });

  it('returns member and claim details for tenant', async () => {
    mocks.claimChain.limit.mockResolvedValue([
      {
        claimId: 'claim-1',
        claimNumber: 'KS-0001',
        status: 'submitted',
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
        memberId: 'member-1',
        memberName: 'Member One',
        memberNumber: 'MEM-001',
        agentId: 'agent-1',
        agentName: 'Agent One',
        agreementFeePercentage: 15,
        agreementMinimumFee: '25.00',
        agreementLegalActionCapPercentage: 25,
        agreementDecisionNextStatus: 'court',
        agreementDecisionReason: 'Strong liability record and member approval captured.',
        agreementPaymentAuthorizationState: 'authorized',
        agreementSuccessFeeRecoveredAmount: '1000.00',
        agreementSuccessFeeCurrencyCode: 'EUR',
        agreementSuccessFeeAmount: '150.00',
        agreementSuccessFeeCollectionMethod: 'payment_method_charge',
        agreementSuccessFeeDeductionAllowed: false,
        agreementSuccessFeeHasStoredPaymentMethod: true,
        agreementSuccessFeeInvoiceDueAt: null,
        agreementSuccessFeeResolvedAt: new Date('2026-03-12T09:30:00Z'),
        agreementSuccessFeeSubscriptionId: 'sub-1',
        agreementTermsVersion: '2026-03-v1',
        agreementSignedAt: new Date('2026-03-11T09:00:00Z'),
        agreementAcceptedAt: new Date('2026-03-11T09:00:00Z'),
      },
    ]);
    mocks.agentChain.limit.mockResolvedValue([{ id: 'agent-1', name: 'Agent One' }]);
    mocks.getMatterAllowanceVisibility.mockResolvedValueOnce({
      allowanceTotal: 2,
      consumedCount: 1,
      remainingCount: 1,
      windowStart: new Date('2026-01-01T00:00:00Z'),
      windowEnd: new Date('2026-12-31T23:59:59Z'),
    });

    const result = await getStaffClaimDetail({
      staffId: 'staff-1',
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
    });

    expect(mocks.withTenant).toHaveBeenCalledWith(
      'tenant-ks',
      mocks.claims.tenantId,
      expect.any(Object)
    );
    expect(result?.claim.claimNumber).toBe('KS-0001');
    expect(result?.member.membershipNumber).toBe('MEM-001');
    expect(result?.agent?.name).toBe('Agent One');
    expect(mocks.getMatterAllowanceVisibility).toHaveBeenCalledWith({
      tenantId: 'tenant-ks',
      userId: 'member-1',
    });
    expect((result as { matterAllowance?: unknown } | null)?.matterAllowance).toEqual({
      allowanceTotal: 2,
      consumedCount: 1,
      remainingCount: 1,
      windowStart: '2026-01-01T00:00:00.000Z',
      windowEnd: '2026-12-31T23:59:59.000Z',
    });
    expect(result?.commercialAgreement).toMatchObject({
      decisionNextStatus: 'court',
      decisionReason: 'Strong liability record and member approval captured.',
      feePercentage: 15,
      minimumFee: '25.00',
      legalActionCapPercentage: 25,
      paymentAuthorizationState: 'authorized',
      termsVersion: '2026-03-v1',
    });
    expect(result?.successFeeCollection).toMatchObject({
      recoveredAmount: '1000.00',
      currencyCode: 'EUR',
      feeAmount: '150.00',
      collectionMethod: 'payment_method_charge',
      deductionAllowed: false,
      hasStoredPaymentMethod: true,
      invoiceDueAt: null,
      subscriptionId: 'sub-1',
    });
  });

  it('returns null when claim is outside tenant scope', async () => {
    mocks.claimChain.limit.mockResolvedValue([]);

    const result = await getStaffClaimDetail({
      staffId: 'staff-9',
      tenantId: 'tenant-mk',
      claimId: 'claim-9',
    });

    expect(result).toBeNull();
  });
});
