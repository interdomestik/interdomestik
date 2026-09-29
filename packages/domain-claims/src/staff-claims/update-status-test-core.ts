import { vi } from 'vitest';
import type {
  PaymentAuthorizationState,
  RecoveryDeclineReasonCode,
  RecoveryDecisionType,
} from './types';
import type { SelectChain, TestMocks } from './update-status-test-types';

function createSelectChain(): SelectChain {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn(),
  };
}
export type MockRecoveryAgreement = {
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
export const READY_ACCEPTED_RECOVERY_RECORD: MockRecoveryAgreement = {
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
export const STANDARD_SUBSCRIPTION = {
  id: 'sub-1',
  planId: 'standard',
  planKey: 'tenant-standard-plan',
  currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
  currentPeriodEnd: new Date('2026-12-31T23:59:59Z'),
};
function createMocks(): TestMocks {
  const agreementSelectChain = createSelectChain();
  const subscriptionSelectChain = createSelectChain();
  const serviceUsageExistsSelectChain = createSelectChain();
  const serviceUsageCountSelectChain = createSelectChain();
  const tenantReadSelectChain = createSelectChain();
  const txSelectChain = createSelectChain();
  const txExecute = vi.fn(async query => {
    const rendered = JSON.stringify(query).toLowerCase();
    if (rendered.includes('pg_advisory_xact_lock')) {
      return [];
    }
    if (rendered.includes('claim_escalation_agreements') && rendered.includes('for update')) {
      return [
        {
          legalActionCapPercentage: 25,
          paymentAuthorizationState: 'authorized',
          signedAt: new Date('2026-03-11T09:00:00Z'),
        },
      ];
    }
    if (rendered.includes('claim_recovery_no_fee_evidence') && rendered.includes('for update')) {
      return [];
    }
    throw new Error(`unexpected recovery lock query: ${rendered}`);
  });
  const txInsertReturning = vi.fn();
  const txInsertOnConflictDoNothing = vi.fn(() => ({ returning: txInsertReturning }));
  const txInsertValues = vi.fn(() => ({
    onConflictDoNothing: txInsertOnConflictDoNothing,
  }));
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const txSelect = vi.fn(() => txSelectChain);
  const txUpdateReturning = vi.fn();
  const txUpdateWhere = vi.fn(() => ({ returning: txUpdateReturning }));
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const withTenantContext = vi.fn(async (_context, cb) =>
    cb({ execute: txExecute, insert: txInsert, select: txSelect, update: txUpdate })
  );
  const transaction = vi.fn(async cb =>
    cb({ execute: txExecute, insert: txInsert, select: txSelect, update: txUpdate })
  );
  return {
    db: {
      query: {
        user: {
          findFirst: vi.fn().mockResolvedValue({ email: 'member@example.com' }),
        },
      },
      select: vi.fn(() => {
        throw new Error('Global select forbidden');
      }),
      transaction,
    },
    logAuditEvent: vi.fn(),
    projectClaimStatusAuditProjection: vi.fn(),
    and: vi.fn((...conditions) => ({ op: 'and', conditions })),
    claims: {
      id: 'claims.id',
      tenantId: 'claims.tenant_id',
      branchId: 'claims.branch_id',
      caseLifecycleState: 'claims.case_lifecycle_state',
      category: 'claims.category',
      staffId: 'claims.staff_id',
      assignedAt: 'claims.assigned_at',
      assignedById: 'claims.assigned_by_id',
      lifecycleVersion: 'claims.lifecycle_version',
      recoveryLifecycleState: 'claims.recovery_lifecycle_state',
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
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: [...strings],
      values,
    })),
    withTenant: vi.fn((_tenantId, _column, condition) => ({ scoped: true, condition })),
    ensureTenantId: vi.fn(() => 'tenant-1'),
    agreementSelectChain,
    subscriptionSelectChain,
    serviceUsageExistsSelectChain,
    serviceUsageCountSelectChain,
    tenantReadSelectChain,
    txInsert,
    txExecute,
    txSelect,
    txSelectChain,
    txInsertOnConflictDoNothing,
    txInsertReturning,
    txInsertValues,
    txUpdate,
    txUpdateReturning,
    txUpdateSet,
    txUpdateWhere,
    withTenantContext,
  };
}
const mocks = vi.hoisted(createMocks);
export { mocks };
vi.mock('@interdomestik/database', () => ({
  and: mocks.and,
  appendEvent: vi.fn().mockResolvedValue({ id: 'event-1' }),
  claimEscalationAgreements: mocks.claimEscalationAgreements,
  claimRecoveryNoFeeEvidence: {
    claimId: 'claim_recovery_no_fee_evidence.claim_id',
    documentedAt: 'claim_recovery_no_fee_evidence.documented_at',
    documentedById: 'claim_recovery_no_fee_evidence.documented_by_id',
    reasonCode: 'claim_recovery_no_fee_evidence.reason_code',
    tenantId: 'claim_recovery_no_fee_evidence.tenant_id',
  },
  claimStageHistory: mocks.claimStageHistory,
  claims: mocks.claims,
  db: mocks.db,
  eq: mocks.eq,
  serviceUsage: mocks.serviceUsage,
  relayClaimStatusAuditProjectionEvents: vi.fn(),
  sql: mocks.sql,
  subscriptions: mocks.subscriptions,
  withTenantContext: mocks.withTenantContext,
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
