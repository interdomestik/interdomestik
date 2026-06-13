import {
  assertBooleanPayloadField,
  assertIntegerPayloadField,
  assertNoUnexpectedPayloadFields,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';

const RECOVERY_DECISION_RECORDED_KEYS = new Set([
  'decisionType',
  'declineReasonCode',
  'hasExplanation',
]);
const RECOVERY_ESCALATION_AGREEMENT_RECORDED_KEYS = new Set([
  'decisionNextStatus',
  'feePercentage',
  'hasDecisionReason',
  'hasLegalActionCap',
  'hasMinimumFee',
  'paymentAuthorizationState',
]);
const RECOVERY_SUCCESS_FEE_COLLECTED_KEYS = new Set([
  'collectionMethod',
  'currencyCode',
  'deductionAllowed',
  'hasInvoiceDueDate',
  'hasStoredPaymentMethod',
  'paymentAuthorizationState',
]);
const RECOVERY_DECISION_TYPES = new Set(['accepted', 'declined']);
const ESCALATION_DECISION_NEXT_STATUSES = new Set(['negotiation', 'court']);
const PAYMENT_AUTHORIZATION_STATES = new Set(['pending', 'authorized', 'revoked']);
const SUCCESS_FEE_COLLECTION_METHODS = new Set(['deduction', 'payment_method_charge', 'invoice']);
const RECOVERY_DECLINE_REASON_CODES = new Set([
  'guidance_only_scope',
  'insufficient_evidence',
  'no_monetary_recovery_path',
  'counterparty_unidentified',
  'time_limit_risk',
  'conflict_or_integrity_concern',
]);

function assertCurrencyCode(payload: Record<string, unknown>): string {
  const value = payload.currencyCode;
  if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) {
    throw new Error('appendEvent requires payload.currencyCode to be an ISO 4217 code');
  }
  return value;
}

export function recoveryDecisionRecordedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'recovery.decision_recorded',
    RECOVERY_DECISION_RECORDED_KEYS
  );
  const decisionType = assertStringSetPayloadField(
    payload,
    'decisionType',
    RECOVERY_DECISION_TYPES,
    'a recovery decision type'
  );
  const hasExplanation = assertBooleanPayloadField(payload, 'hasExplanation');
  if (decisionType === 'accepted') return { decisionType, hasExplanation };

  const declineReasonCode = assertStringSetPayloadField(
    payload,
    'declineReasonCode',
    RECOVERY_DECLINE_REASON_CODES,
    'a recovery decline code'
  );
  return { decisionType, declineReasonCode, hasExplanation };
}

export function recoveryEscalationAgreementRecordedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'recovery.escalation_agreement_recorded',
    RECOVERY_ESCALATION_AGREEMENT_RECORDED_KEYS
  );
  const decisionNextStatus = assertStringSetPayloadField(
    payload,
    'decisionNextStatus',
    ESCALATION_DECISION_NEXT_STATUSES,
    'an escalation status'
  );
  const paymentAuthorizationState = assertStringSetPayloadField(
    payload,
    'paymentAuthorizationState',
    PAYMENT_AUTHORIZATION_STATES,
    'a payment authorization state'
  );
  const feePercentage = assertIntegerPayloadField(payload, 'feePercentage', 1);

  return {
    decisionNextStatus,
    feePercentage,
    hasDecisionReason: assertBooleanPayloadField(payload, 'hasDecisionReason'),
    hasLegalActionCap: assertBooleanPayloadField(payload, 'hasLegalActionCap'),
    hasMinimumFee: assertBooleanPayloadField(payload, 'hasMinimumFee'),
    paymentAuthorizationState,
  };
}

export function recoverySuccessFeeCollectedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'recovery.success_fee_collected',
    RECOVERY_SUCCESS_FEE_COLLECTED_KEYS
  );
  const collectionMethod = assertStringSetPayloadField(
    payload,
    'collectionMethod',
    SUCCESS_FEE_COLLECTION_METHODS,
    'a success-fee collection method'
  );
  const paymentAuthorizationState = assertStringSetPayloadField(
    payload,
    'paymentAuthorizationState',
    PAYMENT_AUTHORIZATION_STATES,
    'a payment authorization state'
  );

  return {
    collectionMethod,
    currencyCode: assertCurrencyCode(payload),
    deductionAllowed: assertBooleanPayloadField(payload, 'deductionAllowed'),
    hasInvoiceDueDate: assertBooleanPayloadField(payload, 'hasInvoiceDueDate'),
    hasStoredPaymentMethod: assertBooleanPayloadField(payload, 'hasStoredPaymentMethod'),
    paymentAuthorizationState,
  };
}
