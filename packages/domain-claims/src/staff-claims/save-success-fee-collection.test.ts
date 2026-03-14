import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClaimsSession } from '../claims/types';
import { saveSuccessFeeCollectionCore } from './save-success-fee-collection';

const mocks = vi.hoisted(() => {
  const claimSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const agreementSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const subscriptionSelectChain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txSelect = vi.fn();
  const transaction = vi.fn(async cb =>
    cb({
      select: txSelect,
      update: txUpdate,
    })
  );

  return {
    db: {
      transaction,
    },
    logAuditEvent: vi.fn(),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      userId: 'claims.user_id',
      currency: 'claims.currency',
    },
    claimEscalationAgreements: {
      tenantId: 'claim_escalation_agreements.tenant_id',
      claimId: 'claim_escalation_agreements.claim_id',
      decisionNextStatus: 'claim_escalation_agreements.decision_next_status',
      decisionReason: 'claim_escalation_agreements.decision_reason',
      feePercentage: 'claim_escalation_agreements.fee_percentage',
      legalActionCapPercentage: 'claim_escalation_agreements.legal_action_cap_percentage',
      minimumFee: 'claim_escalation_agreements.minimum_fee',
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
      successFeeResolvedById: 'claim_escalation_agreements.success_fee_resolved_by_id',
      successFeeSubscriptionId: 'claim_escalation_agreements.success_fee_subscription_id',
      termsVersion: 'claim_escalation_agreements.terms_version',
      signedAt: 'claim_escalation_agreements.signed_at',
      acceptedAt: 'claim_escalation_agreements.accepted_at',
      updatedAt: 'claim_escalation_agreements.updated_at',
    },
    subscriptions: {
      id: 'subscriptions.id',
      tenantId: 'subscriptions.tenant_id',
      userId: 'subscriptions.user_id',
      providerCustomerId: 'subscriptions.provider_customer_id',
    },
    eq: vi.fn((left, right) => ({ left, op: 'eq', right })),
    and: vi.fn((...conditions) => ({ conditions, op: 'and' })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ condition, scoped: true })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    claimSelectChain,
    agreementSelectChain,
    subscriptionSelectChain,
    txSelect,
    txUpdate,
    txUpdateSet,
    txUpdateWhere,
  };
});

vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
  subscriptions: mocks.subscriptions,
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));

function createSession(options: {
  userId: string;
  role?: string;
  tenantId?: string;
}): ClaimsSession {
  return {
    user: {
      id: options.userId,
      role: options.role ?? 'staff',
      tenantId: options.tenantId ?? 'tenant-1',
    },
  } as unknown as ClaimsSession;
}

describe('saveSuccessFeeCollectionCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.txSelect.mockReset();
    mocks.claimSelectChain.from.mockReturnValue(mocks.claimSelectChain);
    mocks.claimSelectChain.where.mockReturnValue(mocks.claimSelectChain);
    mocks.agreementSelectChain.from.mockReturnValue(mocks.agreementSelectChain);
    mocks.agreementSelectChain.where.mockReturnValue(mocks.agreementSelectChain);
    mocks.subscriptionSelectChain.from.mockReturnValue(mocks.subscriptionSelectChain);
    mocks.subscriptionSelectChain.where.mockReturnValue(mocks.subscriptionSelectChain);
  });

  it('rejects unauthorized callers', async () => {
    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
      session: createSession({ role: 'member', userId: 'member-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Unauthorized',
    });
  });

  it('requires stored agreement terms before saving success-fee collection details', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { currency: 'EUR', id: 'claim-1', userId: 'member-1' },
    ]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        feePercentage: null,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
      },
    ]);

    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: true,
      recoveredAmount: 100,
      session: createSession({ userId: 'staff-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Save the accepted escalation agreement before recording success-fee collection.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('rejects accepted cases whose agreement snapshot is still incomplete', async () => {
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { currency: 'EUR', id: 'claim-1', userId: 'member-1' },
    ]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        decisionNextStatus: 'negotiation',
        decisionReason: 'Recovery decision accepted before commercial terms were fully saved.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        termsVersion: '2026-03-v1',
        signedAt: null,
        acceptedAt: new Date('2026-03-14T09:00:00.000Z'),
      },
    ]);

    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: false,
      recoveredAmount: 1000,
      session: createSession({ userId: 'staff-1' }),
    });

    expect(result).toEqual({
      success: false,
      error: 'Save the accepted escalation agreement before recording success-fee collection.',
    });
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it('stores a deduction plan when payout deduction is legally allowed', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain)
      .mockReturnValueOnce(mocks.subscriptionSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { currency: 'EUR', id: 'claim-1', userId: 'member-1' },
    ]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        acceptedAt: new Date('2026-03-12T09:00:00Z'),
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member approved the accepted negotiation path.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedAt: new Date('2026-03-12T09:00:00Z'),
        termsVersion: '2026-03-v1',
      },
    ]);
    mocks.subscriptionSelectChain.limit.mockResolvedValue([]);

    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: true,
      now,
      recoveredAmount: 100,
      session: createSession({ userId: 'staff-1' }),
    });

    expect(mocks.txUpdate).toHaveBeenCalledWith(mocks.claimEscalationAgreements);
    expect(mocks.txUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        successFeeAmount: '25.00',
        successFeeCollectionMethod: 'deduction',
        successFeeCurrencyCode: 'EUR',
        successFeeDeductionAllowed: true,
        successFeeHasStoredPaymentMethod: false,
        successFeeInvoiceDueAt: null,
        successFeeRecoveredAmount: '100.00',
        successFeeResolvedById: 'staff-1',
        successFeeResolvedAt: now,
        successFeeSubscriptionId: null,
      })
    );
    expect(result).toEqual({
      success: true,
      data: {
        claimId: 'claim-1',
        collectionMethod: 'deduction',
        currencyCode: 'EUR',
        deductionAllowed: true,
        feeAmount: '25.00',
        hasStoredPaymentMethod: false,
        invoiceDueAt: null,
        paymentAuthorizationState: 'authorized',
        recoveredAmount: '100.00',
        resolvedAt: '2026-03-12T09:00:00.000Z',
        subscriptionId: null,
      },
    });
  });

  it('uses the stored payment-method charge path when deduction is unavailable and a saved method exists', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain)
      .mockReturnValueOnce(mocks.subscriptionSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { currency: 'EUR', id: 'claim-1', userId: 'member-1' },
    ]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        acceptedAt: new Date('2026-03-12T09:00:00Z'),
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member approved the accepted negotiation path.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedAt: new Date('2026-03-12T09:00:00Z'),
        termsVersion: '2026-03-v1',
      },
    ]);
    mocks.subscriptionSelectChain.limit.mockResolvedValue([
      { id: 'sub-1', providerCustomerId: 'cus_123' },
    ]);

    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: false,
      now,
      recoveredAmount: 1000,
      session: createSession({ userId: 'staff-1' }),
    });

    expect(result).toEqual({
      success: true,
      data: {
        claimId: 'claim-1',
        collectionMethod: 'payment_method_charge',
        currencyCode: 'EUR',
        deductionAllowed: false,
        feeAmount: '150.00',
        hasStoredPaymentMethod: true,
        invoiceDueAt: null,
        paymentAuthorizationState: 'authorized',
        recoveredAmount: '1000.00',
        resolvedAt: '2026-03-12T09:00:00.000Z',
        subscriptionId: 'sub-1',
      },
    });
  });

  it('falls back to a seven-day invoice when the saved payment-method path is unavailable', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain)
      .mockReturnValueOnce(mocks.subscriptionSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { currency: 'EUR', id: 'claim-1', userId: 'member-1' },
    ]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        acceptedAt: new Date('2026-03-12T09:00:00Z'),
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member approved the accepted negotiation path.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'revoked',
        signedAt: new Date('2026-03-12T09:00:00Z'),
        termsVersion: '2026-03-v1',
      },
    ]);
    mocks.subscriptionSelectChain.limit.mockResolvedValue([
      { id: 'sub-1', providerCustomerId: null },
    ]);

    const result = await saveSuccessFeeCollectionCore({
      claimId: 'claim-1',
      deductionAllowed: false,
      now,
      recoveredAmount: 1000,
      session: createSession({ userId: 'staff-1' }),
    });

    expect(result).toEqual({
      success: true,
      data: {
        claimId: 'claim-1',
        collectionMethod: 'invoice',
        currencyCode: 'EUR',
        deductionAllowed: false,
        feeAmount: '150.00',
        hasStoredPaymentMethod: false,
        invoiceDueAt: '2026-03-19T09:00:00.000Z',
        paymentAuthorizationState: 'revoked',
        recoveredAmount: '1000.00',
        resolvedAt: '2026-03-12T09:00:00.000Z',
        subscriptionId: null,
      },
    });
  });

  it('records a commercial audit event when success-fee collection details are saved', async () => {
    const now = new Date('2026-03-12T09:00:00Z');
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    mocks.txSelect
      .mockReturnValueOnce(mocks.claimSelectChain)
      .mockReturnValueOnce(mocks.agreementSelectChain)
      .mockReturnValueOnce(mocks.subscriptionSelectChain);
    mocks.claimSelectChain.limit.mockResolvedValue([
      { currency: 'EUR', id: 'claim-1', userId: 'member-1' },
    ]);
    mocks.agreementSelectChain.limit.mockResolvedValue([
      {
        acceptedAt: new Date('2026-03-12T09:00:00Z'),
        decisionNextStatus: 'negotiation',
        decisionReason: 'Member approved the accepted negotiation path.',
        feePercentage: 15,
        legalActionCapPercentage: 25,
        minimumFee: '25.00',
        paymentAuthorizationState: 'authorized',
        signedAt: new Date('2026-03-12T09:00:00Z'),
        termsVersion: '2026-03-v1',
      },
    ]);
    mocks.subscriptionSelectChain.limit.mockResolvedValue([]);

    const result = await saveSuccessFeeCollectionCore(
      {
        claimId: 'claim-1',
        deductionAllowed: true,
        now,
        recoveredAmount: 100,
        requestHeaders,
        session: createSession({ userId: 'staff-1' }),
      },
      { logAuditEvent: mocks.logAuditEvent }
    );

    expect(result.success).toBe(true);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.success_fee_collection_saved',
        actorId: 'staff-1',
        actorRole: 'staff',
        entityId: 'claim-1',
        entityType: 'claim',
        headers: requestHeaders,
        tenantId: 'tenant-1',
        metadata: expect.objectContaining({
          collectionMethod: 'deduction',
          currencyCode: 'EUR',
          deductionAllowed: true,
          feeAmount: '25.00',
          recoveredAmount: '100.00',
        }),
      })
    );
  });
});
