import {
  SUPPORT_HANDOFF_SOURCES,
  type CreateSupportHandoffInput,
  type SupportHandoffContactPreference,
} from './types';

const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2_000;
const CONTACT_PREFERENCES = new Set<SupportHandoffContactPreference>([
  'staff_reply',
  'phone',
  'email',
  'whatsapp',
]);
const FORBIDDEN_OWNERSHIP_FIELDS = [
  'tenantId',
  'memberId',
  'branchId',
  'staffId',
  'actorId',
  'status',
  'urgency',
  'trustRisk',
] as const;
const SUPPORT_HANDOFF_SOURCE_VALUES = new Set<string>(SUPPORT_HANDOFF_SOURCES);

function normalizeText(value: string | null | undefined, maxLength: number) {
  return value?.trim().replace(/\s+/g, ' ').slice(0, maxLength) ?? '';
}

function normalizeMessage(value: string | null | undefined) {
  return value?.trim().slice(0, MAX_MESSAGE_LENGTH) ?? '';
}

function normalizeContactPreference(value: unknown): SupportHandoffContactPreference {
  return typeof value === 'string' &&
    CONTACT_PREFERENCES.has(value as SupportHandoffContactPreference)
    ? (value as SupportHandoffContactPreference)
    : 'staff_reply';
}

function hasForbiddenOwnershipFields(input: Record<string, unknown>) {
  return FORBIDDEN_OWNERSHIP_FIELDS.some(field =>
    Object.prototype.hasOwnProperty.call(input, field)
  );
}

function normalizeSource(value: unknown) {
  return typeof value === 'string' && SUPPORT_HANDOFF_SOURCE_VALUES.has(value) ? value : null;
}

export function parseMemberSupportHandoffInput(
  input: CreateSupportHandoffInput & Record<string, unknown>
) {
  if (hasForbiddenOwnershipFields(input)) {
    return { success: false as const, error: 'Ownership fields are server-derived' };
  }

  const subject = normalizeText(input.subject, MAX_SUBJECT_LENGTH);
  if (!subject) return { success: false as const, error: 'Subject is required' };

  const message = normalizeMessage(input.message);
  if (message.length < 10) {
    return { success: false as const, error: 'Message must include enough detail' };
  }

  return {
    success: true as const,
    contactPreference: normalizeContactPreference(input.contactPreference),
    message,
    requestedClaimId: normalizeText(input.claimId ?? undefined, 160) || null,
    sourceClaimId: normalizeText(
      typeof input.sourceClaimId === 'string' ? input.sourceClaimId : undefined,
      160
    ),
    sourceHint: normalizeSource(input.source),
    subject,
  };
}
