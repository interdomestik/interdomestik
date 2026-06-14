import {
  CLAIM_CASE_LIFECYCLE_STATES,
  CLAIM_RECOVERY_LIFECYCLE_STATES,
  CLAIM_STATUSES,
  type ClaimCaseLifecycleState,
  type ClaimRecoveryLifecycleState,
  type ClaimStatus,
} from './constants';
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
import {
  membershipAgentClientBoundPayload,
  membershipSubscriptionChangedPayload,
} from './domain-event-membership-payloads';
import type { AppendEventParams } from './domain-events';

const CASE_CREATED_KEYS = new Set(['hasDocuments', 'initialStatus']);
const CASE_LIFECYCLE_CHANGED_KEYS = new Set(['fromState', 'fromStatus', 'toState', 'toStatus']);
const CLAIM_STATUS_CHANGED_KEYS = new Set(['fromStatus', 'toStatus']);
const RECOVERY_LIFECYCLE_CHANGED_KEYS = CASE_LIFECYCLE_CHANGED_KEYS;
const CASE_LIFECYCLE_STATE_SET = new Set<string>(CLAIM_CASE_LIFECYCLE_STATES);
const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);
const RECOVERY_LIFECYCLE_STATE_SET = new Set<string>(CLAIM_RECOVERY_LIFECYCLE_STATES);

function assertClaimStatus(value: unknown, field: string): asserts value is ClaimStatus {
  if (typeof value !== 'string' || !CLAIM_STATUS_SET.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be a claim status`);
  }
}

function assertCaseLifecycleState(
  value: unknown,
  field: string
): asserts value is ClaimCaseLifecycleState {
  if (typeof value !== 'string' || !CASE_LIFECYCLE_STATE_SET.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be a case lifecycle state`);
  }
}

function assertRecoveryLifecycleState(
  value: unknown,
  field: string
): asserts value is ClaimRecoveryLifecycleState {
  if (typeof value !== 'string' || !RECOVERY_LIFECYCLE_STATE_SET.has(value)) {
    throw new Error(`appendEvent requires payload.${field} to be a recovery lifecycle state`);
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

function lifecycleChangedPayload(
  payload: Record<string, unknown>,
  eventName: string,
  keys: Set<string>,
  assertState: (value: unknown, field: string) => void
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, eventName, keys);
  for (const field of ['fromStatus', 'toStatus'] as const) {
    assertRequiredPayloadField(payload, field);
    assertClaimStatus(payload[field], field);
  }
  for (const field of ['fromState', 'toState'] as const) {
    assertRequiredPayloadField(payload, field);
    assertState(payload[field], field);
  }
  return {
    fromState: payload.fromState,
    fromStatus: payload.fromStatus,
    toState: payload.toState,
    toStatus: payload.toStatus,
  };
}

const PAYLOAD_VALIDATORS: Record<
  string,
  (payload: Record<string, unknown>) => Record<string, unknown>
> = {
  'case.created@1': caseCreatedPayload,
  'case.lifecycle_changed@1': payload =>
    lifecycleChangedPayload(
      payload,
      'case.lifecycle_changed',
      CASE_LIFECYCLE_CHANGED_KEYS,
      assertCaseLifecycleState
    ),
  'claim.status_changed@1': claimStatusChangedPayload,
  'recovery.lifecycle_changed@1': payload =>
    lifecycleChangedPayload(
      payload,
      'recovery.lifecycle_changed',
      RECOVERY_LIFECYCLE_CHANGED_KEYS,
      assertRecoveryLifecycleState
    ),
  'recovery.decision_recorded@1': recoveryDecisionRecordedPayload,
  'recovery.escalation_agreement_recorded@1': recoveryEscalationAgreementRecordedPayload,
  'recovery.success_fee_collected@1': recoverySuccessFeeCollectedPayload,
  'membership.agent_client_bound@1': membershipAgentClientBoundPayload,
  'membership.subscription_changed@1': membershipSubscriptionChangedPayload,
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
