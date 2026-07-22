import {
  isKnownIdaFrontDoorHost,
  normalizeTenantHost,
  resolveTenantHostContext,
} from '@/lib/tenant/tenant-front-door';
import { coerceTenantId, TENANT_HEADER_NAME, type TenantId } from '@/lib/tenant/tenant-hosts';

import { recordValue } from './authority-fields';

export type OnboardingMode = 'resolved' | 'deferred';
export type OnboardingSelector = { tenant: TenantId; mode: OnboardingMode };
export type OnboardingIntent = OnboardingSelector & {
  version: 1;
  host: string;
  issuedAt: number;
};
export type OnboardingFailure =
  | 'missing_selector'
  | 'malformed_selector'
  | 'host_conflict'
  | 'tenant_mismatch'
  | 'forbidden_mode'
  | 'unknown_host';
export type OnboardingResolution =
  | { ok: true; intent: OnboardingIntent }
  | { ok: false; reason: OnboardingFailure; resolvedTenantId: TenantId | null };

const MAX_INTENT_AGE_MS = 10 * 60 * 1000;
const FUTURE_SKEW_MS = 30 * 1000;

function selectorCandidate(body: unknown): {
  present: boolean;
  value?: unknown;
  conflict?: boolean;
} {
  const root = recordValue(body);
  if (!root) return { present: false };
  const direct = Object.prototype.hasOwnProperty.call(root, 'onboarding');
  const additional = recordValue(root.additionalData);
  const nested = Boolean(
    additional && Object.prototype.hasOwnProperty.call(additional, 'onboarding')
  );
  if (direct && nested) return { present: true, conflict: true };
  if (direct) return { present: true, value: root.onboarding };
  return nested ? { present: true, value: additional?.onboarding } : { present: false };
}

export function parseOnboardingSelector(
  body: unknown
): { kind: 'absent' } | { kind: 'invalid' } | { kind: 'valid'; selector: OnboardingSelector } {
  const candidate = selectorCandidate(body);
  if (!candidate.present) return { kind: 'absent' };
  const value = recordValue(candidate.value);
  if (candidate.conflict || !value) return { kind: 'invalid' };
  if (Object.keys(value).sort().join(',') !== 'mode,tenant') return { kind: 'invalid' };
  const tenant = typeof value.tenant === 'string' ? coerceTenantId(value.tenant.trim()) : null;
  const mode = value.mode;
  if (!tenant || (mode !== 'resolved' && mode !== 'deferred')) return { kind: 'invalid' };
  return { kind: 'valid', selector: { tenant, mode } };
}

function observedHost(headers: Headers): {
  host: string;
  tenant: TenantId | null;
  conflict: boolean;
} {
  const direct = normalizeTenantHost(headers.get('host'));
  const forwarded = normalizeTenantHost(headers.get('x-forwarded-host'));
  const directContext = resolveTenantHostContext(direct);
  const directTenant = directContext.kind === 'compatibility_alias' ? directContext.tenantId : null;
  const directKnown = directContext.kind !== 'unknown';
  if (directKnown && forwarded && forwarded !== direct)
    return { host: direct, tenant: directTenant, conflict: true };
  const host = directKnown || !forwarded ? direct : forwarded;
  const context = resolveTenantHostContext(host);
  const tenant = context.kind === 'compatibility_alias' ? context.tenantId : null;
  return { host, tenant, conflict: !host };
}

export function resolveOnboardingAuthority(args: {
  headers: Headers;
  body: unknown;
  now?: number;
}): OnboardingResolution {
  const parsed = parseOnboardingSelector(args.body);
  if (parsed.kind !== 'valid') {
    return {
      ok: false,
      reason: parsed.kind === 'absent' ? 'missing_selector' : 'malformed_selector',
      resolvedTenantId: null,
    };
  }
  const observed = observedHost(args.headers);
  if (observed.conflict)
    return { ok: false, reason: 'host_conflict', resolvedTenantId: observed.tenant };
  if (observed.tenant) {
    if (parsed.selector.tenant !== observed.tenant)
      return { ok: false, reason: 'tenant_mismatch', resolvedTenantId: observed.tenant };
    if (parsed.selector.mode !== 'resolved')
      return { ok: false, reason: 'forbidden_mode', resolvedTenantId: observed.tenant };
  } else if (isKnownIdaFrontDoorHost(observed.host)) {
    if (parsed.selector.mode !== 'deferred')
      return { ok: false, reason: 'forbidden_mode', resolvedTenantId: null };
    const headerTenant = coerceTenantId(args.headers.get(TENANT_HEADER_NAME));
    if (headerTenant && headerTenant !== parsed.selector.tenant) {
      return { ok: false, reason: 'tenant_mismatch', resolvedTenantId: headerTenant };
    }
  } else return { ok: false, reason: 'unknown_host', resolvedTenantId: null };
  return {
    ok: true,
    intent: {
      version: 1,
      ...parsed.selector,
      host: observed.host,
      issuedAt: args.now ?? Date.now(),
    },
  };
}

export function revalidateOnboardingIntent(
  value: unknown,
  headers: Headers,
  now = Date.now()
): OnboardingIntent | null {
  const intent = recordValue(value);
  if (!intent || Object.keys(intent).sort().join(',') !== 'host,issuedAt,mode,tenant,version')
    return null;
  if (
    intent.version !== 1 ||
    typeof intent.host !== 'string' ||
    typeof intent.issuedAt !== 'number'
  )
    return null;
  if (intent.issuedAt > now + FUTURE_SKEW_MS || now - intent.issuedAt > MAX_INTENT_AGE_MS)
    return null;
  const resolved = resolveOnboardingAuthority({
    headers,
    body: { onboarding: { tenant: intent.tenant, mode: intent.mode } },
    now: intent.issuedAt,
  });
  if (!resolved.ok || resolved.intent.host !== intent.host) return null;
  return resolved.intent;
}
