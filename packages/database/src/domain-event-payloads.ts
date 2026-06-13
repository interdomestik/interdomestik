import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import type { AppendEventParams } from './domain-events';

const CASE_CREATED_KEYS = new Set(['hasDocuments', 'initialStatus']);
const CLAIM_STATUS_CHANGED_KEYS = new Set(['fromStatus', 'toStatus']);
const RECOVERY_DECISION_RECORDED_KEYS = new Set([
  'decisionType',
  'declineReasonCode',
  'hasExplanation',
]);
const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);
const RECOVERY_DECISION_TYPES = new Set(['accepted', 'declined']);
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

function assertNoUnexpectedPayloadFields(
  payload: Record<string, unknown>,
  eventName: string,
  allowedKeys: Set<string>
): void {
  for (const field of Object.keys(payload)) {
    if (!allowedKeys.has(field)) {
      throw new Error(`appendEvent payload field ${field} is not allowlisted for ${eventName}`);
    }
  }
}

function assertRequiredPayloadField(payload: Record<string, unknown>, field: string): unknown {
  if (!Object.hasOwn(payload, field)) {
    throw new Error(`appendEvent requires payload.${field}`);
  }
  return payload[field];
}

function assertBooleanPayloadField(payload: Record<string, unknown>, field: string): boolean {
  const value = assertRequiredPayloadField(payload, field);
  if (typeof value !== 'boolean') {
    throw new TypeError(`appendEvent requires payload.${field} to be a boolean`);
  }
  return value;
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
  const decisionType = assertRequiredPayloadField(payload, 'decisionType');
  if (typeof decisionType !== 'string' || !RECOVERY_DECISION_TYPES.has(decisionType)) {
    throw new Error('appendEvent requires payload.decisionType to be a recovery decision type');
  }

  const hasExplanation = assertBooleanPayloadField(payload, 'hasExplanation');
  if (decisionType === 'accepted') return { decisionType, hasExplanation };

  const declineReasonCode = assertRequiredPayloadField(payload, 'declineReasonCode');
  if (
    typeof declineReasonCode !== 'string' ||
    !RECOVERY_DECLINE_REASON_CODES.has(declineReasonCode)
  ) {
    throw new Error('appendEvent requires payload.declineReasonCode to be a recovery decline code');
  }

  return { decisionType, declineReasonCode, hasExplanation };
}

const PAYLOAD_VALIDATORS: Record<
  string,
  (payload: Record<string, unknown>) => Record<string, unknown>
> = {
  'case.created@1': caseCreatedPayload,
  'claim.status_changed@1': claimStatusChangedPayload,
  'recovery.decision_recorded@1': recoveryDecisionRecordedPayload,
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
