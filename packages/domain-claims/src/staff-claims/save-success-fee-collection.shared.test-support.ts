import type { Mock } from 'vitest';
import { vi } from 'vitest';
import {
  createAcceptedAgreement,
  type MockAgreementRecord,
  type MockClaimRecord,
  type MockSubscriptionRecord,
} from './save-success-fee-collection.test-support';

const mocks: {
  db: { transaction: Mock };
  logAuditEvent: Mock;
  claims: { id: string; tenantId: string; userId: string; category: string; currency: string };
  claimEscalationAgreements: {
    tenantId: string;
    claimId: string;
    decisionNextStatus: string;
    decisionReason: string;
    feePercentage: string;
    legalActionCapPercentage: string;
    minimumFee: string;
    paymentAuthorizationState: string;
    successFeeRecoveredAmount: string;
    successFeeCurrencyCode: string;
    successFeeAmount: string;
    successFeeCollectionMethod: string;
    successFeeDeductionAllowed: string;
    successFeeHasStoredPaymentMethod: string;
    successFeeInvoiceDueAt: string;
    successFeeResolvedAt: string;
    successFeeResolvedById: string;
    successFeeSubscriptionId: string;
    termsVersion: string;
    signedAt: string;
    acceptedAt: string;
    updatedAt: string;
  };
  subscriptions: { id: string; tenantId: string; userId: string; providerCustomerId: string };
  eq: Mock;
  and: Mock;
  withTenant: Mock;
  ensureTenantId: Mock;
  claimSelectChain: { from: Mock; where: Mock; limit: Mock };
  agreementSelectChain: { from: Mock; where: Mock; limit: Mock };
  subscriptionSelectChain: { from: Mock; where: Mock; limit: Mock };
  txSelect: Mock;
  txUpdate: Mock;
  txUpdateSet: Mock;
  txUpdateWhere: Mock;
} = vi.hoisted(() => {
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
      category: 'claims.category',
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
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claims: mocks.claims,
  db: mocks.db,
  withTenantContext: vi.fn(async (_ctx: unknown, cb: (tx: any) => unknown) =>
    mocks.db.transaction(cb)
  ),
  eq: mocks.eq,
  subscriptions: mocks.subscriptions,
}));
vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));
vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: mocks.ensureTenantId,
}));
function mockSaveSelects(options?: {
  agreement?: Array<MockAgreementRecord>;
  claim?: Array<MockClaimRecord>;
  subscription?: Array<MockSubscriptionRecord>;
}) {
  mocks.txSelect
    .mockReturnValueOnce(mocks.claimSelectChain)
    .mockReturnValueOnce(mocks.agreementSelectChain)
    .mockReturnValueOnce(mocks.subscriptionSelectChain);
  mocks.claimSelectChain.limit.mockResolvedValue(
    options?.claim ?? [{ category: 'vehicle', currency: 'EUR', id: 'claim-1', userId: 'member-1' }]
  );
  mocks.agreementSelectChain.limit.mockResolvedValue(
    options?.agreement ?? [createAcceptedAgreement()]
  );
  mocks.subscriptionSelectChain.limit.mockResolvedValue(options?.subscription ?? []);
}

export { mocks, mockSaveSelects };
