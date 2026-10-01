export type StaffClaimRowOverrides = Record<string, unknown>;

export const claimsColumns = {
  id: 'claims.id',
  tenantId: 'claims.tenant_id',
  branchId: 'claims.branch_id',
  category: 'claims.category',
  claimNumber: 'claims.claim_number',
  status: 'claims.status',
  updatedAt: 'claims.updated_at',
  createdAt: 'claims.created_at',
  staffId: 'claims.staff_id',
  userId: 'claims.user_id',
  agentId: 'claims.agent_id',
} as const;

export const userColumns = {
  id: 'user.id',
  tenantId: 'user.tenant_id',
  name: 'user.name',
  memberNumber: 'user.member_number',
} as const;

export const agreementColumns = {
  claimId: 'claim_escalation_agreements.claim_id',
  decisionType: 'claim_escalation_agreements.decision_type',
  declineReasonCode: 'claim_escalation_agreements.decline_reason_code',
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
} as const;

export function createClaimRow(overrides: StaffClaimRowOverrides = {}) {
  return {
    claimId: 'claim-1',
    claimCategory: 'vehicle',
    claimNumber: 'KS-0001',
    status: 'evaluation',
    updatedAt: new Date('2026-03-14T00:00:00Z'),
    createdAt: new Date('2026-03-10T00:00:00Z'),
    memberId: 'member-1',
    memberName: 'Member One',
    memberNumber: 'MEM-001',
    agentId: null,
    agreementDecisionType: 'accepted',
    agreementDeclineReasonCode: null,
    agreementDecisionNextStatus: 'negotiation',
    agreementDecisionReason: 'Clear insurer path and viable monetary recovery.',
    agreementFeePercentage: 20,
    agreementMinimumFee: '25.00',
    agreementLegalActionCapPercentage: 35,
    agreementPaymentAuthorizationState: 'authorized',
    agreementSuccessFeeRecoveredAmount: null,
    agreementSuccessFeeCurrencyCode: null,
    agreementSuccessFeeAmount: null,
    agreementSuccessFeeCollectionMethod: null,
    agreementSuccessFeeDeductionAllowed: null,
    agreementSuccessFeeHasStoredPaymentMethod: null,
    agreementSuccessFeeInvoiceDueAt: null,
    agreementSuccessFeeResolvedAt: null,
    agreementSuccessFeeSubscriptionId: null,
    agreementTermsVersion: '2026-03-v1',
    agreementSignedAt: null,
    agreementAcceptedAt: new Date('2026-03-14T09:00:00Z'),
    ...overrides,
  };
}

export function createDatabaseMock(
  db: unknown,
  operators: { eq: unknown; and: unknown; withTenantContext: unknown }
) {
  return {
    db,
    claimEscalationAgreements: agreementColumns,
    claims: claimsColumns,
    user: userColumns,
    eq: operators.eq,
    and: operators.and,
    withTenantContext: operators.withTenantContext,
  };
}
