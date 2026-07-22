import { APIError } from 'better-auth/api';

export const AUTHORITY_FIELDS = [
  'role',
  'tenantId',
  'branchId',
  'memberNumber',
  'tenantClassificationPending',
  'agentId',
  'referralCode',
] as const;

export const AUTHORITY_INTENT_KEY = '__interdomestikAuthorityIntent';
export type AuthorityField = (typeof AUTHORITY_FIELDS)[number];

export function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function authorityFieldsPresent(value: unknown): AuthorityField[] {
  const record = recordValue(value);
  return record ? AUTHORITY_FIELDS.filter(field => field in record) : [];
}

export function authorityFieldError(): APIError {
  return new APIError('BAD_REQUEST', {
    code: 'AUTHORITY_FIELD_NOT_WRITABLE',
    message: 'Authority fields are server managed',
  });
}

export function invalidOnboardingError(): APIError {
  return new APIError('BAD_REQUEST', {
    code: 'INVALID_ONBOARDING_CONTEXT',
    message: 'Invalid onboarding context',
  });
}

export function assertNoAuthorityFields(value: unknown): void {
  if (authorityFieldsPresent(value).length > 0) throw authorityFieldError();
}

export function replaceRecordContents(
  value: unknown,
  omitted: ReadonlySet<string>,
  additions: Record<string, unknown> = {}
): Record<string, unknown> {
  const record = recordValue(value);
  if (!record) throw invalidOnboardingError();
  const next = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (omitted.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !('value' in descriptor)) throw invalidOnboardingError();
    next[key] = descriptor.value;
  }
  Object.assign(next, additions);
  try {
    for (const key of Reflect.ownKeys(record)) {
      if (!delete record[key as keyof typeof record]) throw invalidOnboardingError();
    }
    Object.setPrototypeOf(record, null);
    Object.assign(record, next);
  } catch (error) {
    if (error instanceof APIError) throw error;
    throw invalidOnboardingError();
  }
  return record;
}

export const CREATION_AUTHORITY_KEYS = new Set<string>([
  ...AUTHORITY_FIELDS,
  AUTHORITY_INTENT_KEY,
  'onboarding',
  'additionalData',
]);
