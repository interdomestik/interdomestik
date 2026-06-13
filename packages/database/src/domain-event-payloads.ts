import { CLAIM_STATUSES, type ClaimStatus } from './constants';
import {
  assertBooleanPayloadField,
  assertNoUnexpectedPayloadFields,
  assertRequiredPayloadField,
} from './domain-event-payload-helpers';
import {
  recoveryDecisionRecordedPayload,
  recoveryEscalationAgreementRecordedPayload,
  recoverySuccessFeeCollectedPayload,
} from './domain-event-recovery-payloads';
import type { AppendEventParams } from './domain-events';

const CASE_CREATED_KEYS = new Set(['hasDocuments', 'initialStatus']);
const CLAIM_STATUS_CHANGED_KEYS = new Set(['fromStatus', 'toStatus']);
const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);

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

const PAYLOAD_VALIDATORS: Record<
  string,
  (payload: Record<string, unknown>) => Record<string, unknown>
> = {
  'case.created@1': caseCreatedPayload,
  'claim.status_changed@1': claimStatusChangedPayload,
  'recovery.decision_recorded@1': recoveryDecisionRecordedPayload,
  'recovery.escalation_agreement_recorded@1': recoveryEscalationAgreementRecordedPayload,
  'recovery.success_fee_collected@1': recoverySuccessFeeCollectedPayload,
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
