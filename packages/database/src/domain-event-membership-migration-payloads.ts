import {
  assertIntegerPayloadField,
  assertNoUnexpectedPayloadFields,
  assertRequiredPayloadField,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';

const ENTITY_MIGRATED_KEYS = new Set([
  'activeRecoveryCaseCount',
  'approvalKind',
  'fromGoverningLaw',
  'fromLegalEntityId',
  'fromLegalTenantId',
  'fromTermsVersionAccepted',
  'migrationMode',
  'termsAction',
  'toGoverningLaw',
  'toLegalEntityId',
  'toLegalTenantId',
  'toTermsVersionAccepted',
]);

const APPROVAL_KINDS = new Set(['human_approval', 'explicit_waiver']);
const MIGRATION_MODES = new Set(['apply', 'rollback']);
const TERMS_ACTIONS = new Set(['reissue_and_recapture']);
const ISO_COUNTRY = /^[A-Z]{2}$/u;

function textOrNull(payload: Record<string, unknown>, field: string): string | null {
  const value = assertRequiredPayloadField(payload, field);
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`appendEvent requires payload.${field} to be text or null`);
  }
  return value.trim();
}

function isoCountryOrNull(payload: Record<string, unknown>, field: string): string | null {
  const value = textOrNull(payload, field);
  if (value !== null && !ISO_COUNTRY.test(value)) {
    throw new Error(`appendEvent requires payload.${field} to be ISO 3166 alpha-2 or null`);
  }
  return value;
}

export function membershipEntityMigratedPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'membership.entity_migrated', ENTITY_MIGRATED_KEYS);

  return {
    activeRecoveryCaseCount: assertIntegerPayloadField(payload, 'activeRecoveryCaseCount', 0),
    approvalKind: assertStringSetPayloadField(
      payload,
      'approvalKind',
      APPROVAL_KINDS,
      'a migration approval kind'
    ),
    fromGoverningLaw: isoCountryOrNull(payload, 'fromGoverningLaw'),
    fromLegalEntityId: textOrNull(payload, 'fromLegalEntityId'),
    fromLegalTenantId: textOrNull(payload, 'fromLegalTenantId'),
    fromTermsVersionAccepted: textOrNull(payload, 'fromTermsVersionAccepted'),
    migrationMode: assertStringSetPayloadField(
      payload,
      'migrationMode',
      MIGRATION_MODES,
      'a member entity migration mode'
    ),
    termsAction: assertStringSetPayloadField(
      payload,
      'termsAction',
      TERMS_ACTIONS,
      'a member entity migration terms action'
    ),
    toGoverningLaw: isoCountryOrNull(payload, 'toGoverningLaw'),
    toLegalEntityId: textOrNull(payload, 'toLegalEntityId'),
    toLegalTenantId: textOrNull(payload, 'toLegalTenantId'),
    toTermsVersionAccepted: textOrNull(payload, 'toTermsVersionAccepted'),
  };
}
