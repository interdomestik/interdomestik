import {
  assertBooleanPayloadField,
  assertIntegerPayloadField,
  assertNoUnexpectedPayloadFields,
  assertRequiredPayloadField,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';

const RESIDENCE_COUNTRY_CHANGED_KEYS = new Set([
  'activeRecoveryClaimCount',
  'activeRecoveryRunoff',
  'changeState',
  'dsrDecision',
  'fromResidenceCountry',
  'migrationDecision',
  'termsAcceptanceState',
  'termsAction',
  'termsVersionAccepted',
  'toResidenceCountry',
]);
const CHANGE_STATES = new Set(['pending_terms_reacceptance', 'deferred_active_recovery_runoff']);
const TERMS_ACTIONS = new Set([
  'require_reacceptance_before_renewal',
  'defer_reacceptance_until_recovery_terminal',
]);
const MIGRATION_DECISIONS = new Set([
  'defer_to_renewal',
  'run_off_legacy_entity_until_recovery_terminal',
]);
const DSR_DECISIONS = new Set([
  'standard_dsr_with_erasure_render',
  'legal_hold_run_off_until_recovery_terminal',
]);
const TERMS_ACCEPTANCE_STATES = new Set([
  'accepted_snapshot_present',
  'missing_acceptance_snapshot',
]);
const ISO_COUNTRY = /^[A-Z]{2}$/u;

function optionalText(payload: Record<string, unknown>, field: string): string | null {
  const value = assertRequiredPayloadField(payload, field);
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`appendEvent requires payload.${field} to be text or null`);
  }
  return value;
}

function optionalIsoCountry(payload: Record<string, unknown>, field: string): string | null {
  const value = optionalText(payload, field);
  if (value !== null && !ISO_COUNTRY.test(value)) {
    throw new Error(`appendEvent requires payload.${field} to be ISO 3166 alpha-2 or null`);
  }
  return value;
}

function isoCountry(payload: Record<string, unknown>, field: string): string {
  const value = assertRequiredPayloadField(payload, field);
  if (typeof value !== 'string' || !ISO_COUNTRY.test(value)) {
    throw new Error(`appendEvent requires payload.${field} to be ISO 3166 alpha-2`);
  }
  return value;
}

export function memberResidenceCountryChangedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(
    payload,
    'member.residence_country_changed',
    RESIDENCE_COUNTRY_CHANGED_KEYS
  );

  return {
    activeRecoveryClaimCount: assertIntegerPayloadField(payload, 'activeRecoveryClaimCount', 0),
    activeRecoveryRunoff: assertBooleanPayloadField(payload, 'activeRecoveryRunoff'),
    changeState: assertStringSetPayloadField(
      payload,
      'changeState',
      CHANGE_STATES,
      'a change state'
    ),
    dsrDecision: assertStringSetPayloadField(
      payload,
      'dsrDecision',
      DSR_DECISIONS,
      'a DSR decision'
    ),
    fromResidenceCountry: optionalIsoCountry(payload, 'fromResidenceCountry'),
    migrationDecision: assertStringSetPayloadField(
      payload,
      'migrationDecision',
      MIGRATION_DECISIONS,
      'a residence migration decision'
    ),
    termsAcceptanceState: assertStringSetPayloadField(
      payload,
      'termsAcceptanceState',
      TERMS_ACCEPTANCE_STATES,
      'a terms acceptance state'
    ),
    termsAction: assertStringSetPayloadField(
      payload,
      'termsAction',
      TERMS_ACTIONS,
      'a terms action'
    ),
    termsVersionAccepted: optionalText(payload, 'termsVersionAccepted'),
    toResidenceCountry: isoCountry(payload, 'toResidenceCountry'),
  };
}
