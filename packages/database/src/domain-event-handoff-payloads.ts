import {
  assertBooleanPayloadField,
  assertNoUnexpectedPayloadFields,
  assertRequiredPayloadField,
  assertStringSetPayloadField,
} from './domain-event-payload-helpers';

const HANDOFF_KEYS = new Set([
  'documentClasses',
  'fromTenantId',
  'grantActorId',
  'grantExpiresAt',
  'grantId',
  'grantIssued',
  'grantReasonCode',
  'incidentCountryCode',
  'recoveryLegalTenantId',
]);
const HANDOFF_DOCUMENT_CLASSES = new Set([
  'correspondence',
  'contract',
  'evidence',
  'legal',
  'receipt',
]);
const HANDOFF_REASON_CODES = new Set(['incident_jurisdiction']);

function assertTenantIdentifier(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !/^(tenant|pilot)[-_][a-z0-9]+(?:[-_][a-z0-9]+)*$/u.test(value)
  ) {
    throw new Error(`appendEvent requires payload.${field} to be a tenant identifier`);
  }
  return value;
}

function assertIdentifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`appendEvent requires payload.${field}`);
  }
  return value.trim();
}

function assertCountryCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{2}$/u.test(value)) {
    throw new Error('appendEvent requires payload.incidentCountryCode to be ISO 3166 alpha-2');
  }
  return value;
}

function assertGrantExpiry(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError('appendEvent requires payload.grantExpiresAt to be ISO 8601 or null');
  }
  return value;
}

function assertDocumentClasses(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('appendEvent requires payload.documentClasses');
  }
  return value.map(item =>
    assertStringSetPayloadField(
      { documentClass: item },
      'documentClass',
      HANDOFF_DOCUMENT_CLASSES,
      'an approved handoff document class'
    )
  );
}

export function recoveryHandedOffToJurisdictionPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  assertNoUnexpectedPayloadFields(payload, 'recovery.handed_off_to_jurisdiction', HANDOFF_KEYS);
  return {
    documentClasses: assertDocumentClasses(assertRequiredPayloadField(payload, 'documentClasses')),
    fromTenantId: assertTenantIdentifier(payload.fromTenantId, 'fromTenantId'),
    grantActorId: assertIdentifier(payload.grantActorId, 'grantActorId'),
    grantExpiresAt: assertGrantExpiry(assertRequiredPayloadField(payload, 'grantExpiresAt')),
    grantId: assertIdentifier(payload.grantId, 'grantId'),
    grantIssued: assertBooleanPayloadField(payload, 'grantIssued'),
    grantReasonCode: assertStringSetPayloadField(
      payload,
      'grantReasonCode',
      HANDOFF_REASON_CODES,
      'a handoff reason code'
    ),
    incidentCountryCode: assertCountryCode(payload.incidentCountryCode),
    recoveryLegalTenantId: assertTenantIdentifier(
      payload.recoveryLegalTenantId,
      'recoveryLegalTenantId'
    ),
  };
}
