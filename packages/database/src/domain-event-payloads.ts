import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import {
  assertBooleanPayloadField,
  assertIntegerPayloadField,
  assertNoUnexpectedPayloadFields,
  assertRequiredPayloadField,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';
import type { AppendEventParams } from './domain-events';

const CASE_CREATED_KEYS = new Set(['hasDocuments', 'initialStatus']);
const CLAIM_STATUS_CHANGED_KEYS = new Set(['fromStatus', 'toStatus']);
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
const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);
const RECOVERY_DECISION_TYPES = new Set(['accepted', 'declined']);
const ESCALATION_DECISION_NEXT_STATUSES = new Set(['negotiation', 'court']);
const PAYMENT_AUTHORIZATION_STATES = new Set(['pending', 'authorized', 'revoked']);
const RECOVERY_DECLINE_REASON_CODES = new Set([
  'guidance_only_scope',
  'insufficient_evidence',
  'no_monetary_recovery_path',
  'counterparty_unidentified',
  'time_limit_risk',
  'conflict_or_integrity_concern',
]);

function assertClaimStatus(value: unknown, field: string): asserts value is ClaimStatus {
  if (typeof value !== 'string' || !CLAIM_STATUS_SET.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be a claim status`);
  }
}

function claimStatusChangedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'claim.status_changed', CLAIM_STATUS_CHANGED_KEYS);
  for (const field of CLAIM_STATUS_CHANGED_KEYS) {
    assertRequiredPayloadField(payload, field);
    assertClaimStatus(payload[field], field);
  }
  return { fromStatus: payload.fromStatus, toStatus: payload.toStatus };
}

function caseCreatedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'case.created', CASE_CREATED_KEYS);
  const initialStatus = assertRequiredPayloadField(payload, 'initialStatus');
  assertClaimStatus(initialStatus, 'initialStatus');
  return {
    hasDocuments: assertBooleanPayloadField(payload, 'hasDocuments'),
    initialStatus,
  };
}

function recoveryDecisionRecordedPayload(
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

function recoveryEscalationAgreementRecordedPayload(
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

const PAYLOAD_VALIDATORS: Record<
  string,
  (payload: Record<string, unknown>) => Record<string, unknown>
> = {
  'case.created@1': caseCreatedPayload,
  'claim.status_changed@1': claimStatusChangedPayload,
  'recovery.decision_recorded@1': recoveryDecisionRecordedPayload,
  'recovery.escalation_agreement_recorded@1': recoveryEscalationAgreementRecordedPayload,
};

export function assertAllowlistedPayload(params: AppendEventParams): Record<string, unknown> {
  const payload = params.payload ?? {};
  const allowlistKey = `${params.eventName}@${params.eventVersion}`;
  const validator = PAYLOAD_VALIDATORS[allowlistKey];

  if (!validator) {
    throw new Error(`appendEvent payload allowlist missing for ${allowlistKey}`);
  }

  return validator(payload);
}
