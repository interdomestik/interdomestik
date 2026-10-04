import { coerceTenantId, TENANT_HEADER_NAME, type TenantId } from '@/lib/tenant/tenant-hosts';

export type SignInTenantHintRejection =
  | 'invalid_header'
  | 'malformed_additional_data'
  | 'unsupported_value'
  | 'conflicting_body_hints'
  | 'header_body_conflict';

export type SignInTenantHintResult =
  | { kind: 'absent' }
  | { kind: 'valid'; tenantId: TenantId }
  | { kind: 'invalid'; reason: SignInTenantHintRejection };

type AdditionalDataResult =
  { kind: 'absent' } | { kind: 'malformed' } | { kind: 'present'; data: Record<string, unknown> };

// `default_booking_tenant_id` is booking context. It is still validated as an explicit body hint
// when a caller sends it, but it never acts as a silent identity default for a neutral login.
const BODY_HINT_KEYS = ['tenantId', 'default_booking_tenant_id'] as const;

function readAdditionalData(body: unknown): AdditionalDataResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { kind: 'absent' };

  const additionalData = (body as { additionalData?: unknown }).additionalData;
  if (additionalData === undefined || additionalData === null) return { kind: 'absent' };
  if (typeof additionalData !== 'object' || Array.isArray(additionalData)) {
    return { kind: 'malformed' };
  }

  return { kind: 'present', data: additionalData as Record<string, unknown> };
}

export function resolveSignInAdditionalTenantHint(body: unknown): SignInTenantHintResult {
  const additionalData = readAdditionalData(body);
  if (additionalData.kind === 'absent') return { kind: 'absent' };
  if (additionalData.kind === 'malformed') {
    return { kind: 'invalid', reason: 'malformed_additional_data' };
  }

  let resolved: TenantId | null = null;
  for (const key of BODY_HINT_KEYS) {
    const raw = additionalData.data[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') return { kind: 'invalid', reason: 'unsupported_value' };

    const tenantId = coerceTenantId(raw.trim());
    if (!tenantId) return { kind: 'invalid', reason: 'unsupported_value' };
    if (resolved !== null && resolved !== tenantId) {
      return { kind: 'invalid', reason: 'conflicting_body_hints' };
    }
    resolved = tenantId;
  }

  return resolved ? { kind: 'valid', tenantId: resolved } : { kind: 'absent' };
}

function resolveSignInHeaderTenantHint(headers: Headers): SignInTenantHintResult {
  const raw = headers.get(TENANT_HEADER_NAME);
  if (raw === null) return { kind: 'absent' };

  const value = raw.trim();
  if (!value) return { kind: 'absent' };

  // A comma-joined duplicate header never coerces, so ambiguous values fail closed here.
  const tenantId = coerceTenantId(value);
  return tenantId ? { kind: 'valid', tenantId } : { kind: 'invalid', reason: 'invalid_header' };
}

/**
 * Resolves the explicit tenant context a sign-in request carries, keeping absent, malformed and
 * conflicting states distinct. Cookies are deliberately excluded: they are not explicit context.
 */
export function resolveSignInTenantContext(
  headers: Headers,
  body?: unknown
): SignInTenantHintResult {
  const header = resolveSignInHeaderTenantHint(headers);
  if (header.kind === 'invalid') return header;

  const bodyHint = resolveSignInAdditionalTenantHint(body);
  if (bodyHint.kind === 'invalid') return bodyHint;

  if (
    header.kind === 'valid' &&
    bodyHint.kind === 'valid' &&
    header.tenantId !== bodyHint.tenantId
  ) {
    return { kind: 'invalid', reason: 'header_body_conflict' };
  }

  return header.kind === 'valid' ? header : bodyHint;
}
