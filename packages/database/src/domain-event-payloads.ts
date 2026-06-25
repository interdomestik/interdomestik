import {
  CLAIM_CASE_LIFECYCLE_STATES,
  CLAIM_RECOVERY_LIFECYCLE_STATES,
  CLAIM_STATUSES,
} from './constants';
import {
  assertBooleanPayloadField,
  evidenceReferencePayload,
  assertNoUnexpectedPayloadFields,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';
import {
  recoveryDecisionRecordedPayload,
  recoveryEscalationAgreementRecordedPayload,
  recoverySuccessFeeCollectedPayload,
} from './domain-event-recovery-payloads';
import { recoveryHandedOffToJurisdictionPayload } from './domain-event-handoff-payloads';
import { memberResidenceCountryChangedPayload } from './domain-event-member-payloads';
import { membershipEntityMigratedPayload } from './domain-event-membership-migration-payloads';
import {
  legacyMembershipAgentClientBoundPayload,
  membershipAttributionRecordedPayload,
  membershipSubscriptionChangedPayload,
} from './domain-event-membership-payloads';
import type { AppendEventParams } from './domain-events';

const CASE_CREATED_KEYS = new Set(['hasDocuments', 'initialStatus']);
const EVIDENCE_KEYS = ['evidenceCount', 'evidenceIds'] as const;
const CASE_LIFECYCLE_CHANGED_KEYS = new Set([
  ...EVIDENCE_KEYS,
  'fromState',
  'fromStatus',
  'toState',
  'toStatus',
]);
const CLAIM_STATUS_CHANGED_KEYS = new Set([...EVIDENCE_KEYS, 'fromStatus', 'toStatus']);
const RECOVERY_LIFECYCLE_CHANGED_KEYS = CASE_LIFECYCLE_CHANGED_KEYS;
const CASE_LIFECYCLE_STATE_SET = new Set<string>(CLAIM_CASE_LIFECYCLE_STATES);
const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);
const RECOVERY_LIFECYCLE_STATE_SET = new Set<string>(CLAIM_RECOVERY_LIFECYCLE_STATES);

function claimStatusPayload(payload: Record<string, unknown>, field: string): string {
  return assertStringSetPayloadField(payload, field, CLAIM_STATUS_SET, 'a claim status');
}

function caseLifecycleStatePayload(payload: Record<string, unknown>, field: string): string {
  return assertStringSetPayloadField(
    payload,
    field,
    CASE_LIFECYCLE_STATE_SET,
    'a case lifecycle state'
  );
}

function recoveryLifecycleStatePayload(payload: Record<string, unknown>, field: string): string {
  return assertStringSetPayloadField(
    payload,
    field,
    RECOVERY_LIFECYCLE_STATE_SET,
    'a recovery lifecycle state'
  );
}

function claimStatusChangedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'claim.status_changed', CLAIM_STATUS_CHANGED_KEYS);
  for (const field of CLAIM_STATUS_CHANGED_KEYS) {
    if (field === 'evidenceCount' || field === 'evidenceIds') continue;
    claimStatusPayload(payload, field);
  }
  return {
    ...evidenceReferencePayload(payload),
    fromStatus: payload.fromStatus,
    toStatus: payload.toStatus,
  };
}

function caseCreatedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'case.created', CASE_CREATED_KEYS);
  return {
    hasDocuments: assertBooleanPayloadField(payload, 'hasDocuments'),
    initialStatus: claimStatusPayload(payload, 'initialStatus'),
  };
}

function lifecycleChangedPayload(
  payload: Record<string, unknown>,
  eventName: string,
  keys: Set<string>,
  statePayload: (payload: Record<string, unknown>, field: string) => string
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, eventName, keys);
  for (const field of ['fromStatus', 'toStatus'] as const) {
    claimStatusPayload(payload, field);
  }
  for (const field of ['fromState', 'toState'] as const) {
    statePayload(payload, field);
  }
  return {
    ...evidenceReferencePayload(payload),
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
      caseLifecycleStatePayload
    ),
  'claim.status_changed@1': claimStatusChangedPayload,
  'recovery.lifecycle_changed@1': payload =>
    lifecycleChangedPayload(
      payload,
      'recovery.lifecycle_changed',
      RECOVERY_LIFECYCLE_CHANGED_KEYS,
      recoveryLifecycleStatePayload
    ),
  'recovery.decision_recorded@1': recoveryDecisionRecordedPayload,
  'recovery.escalation_agreement_recorded@1': recoveryEscalationAgreementRecordedPayload,
  'recovery.success_fee_collected@1': recoverySuccessFeeCollectedPayload,
  'recovery.handed_off_to_jurisdiction@1': recoveryHandedOffToJurisdictionPayload,
  'member.residence_country_changed@1': memberResidenceCountryChangedPayload,
  'membership.agent_client_bound@1': legacyMembershipAgentClientBoundPayload,
  'membership.agent_attribution_recorded@1': membershipAttributionRecordedPayload,
  'membership.entity_migrated@1': membershipEntityMigratedPayload,
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
