import { isKnownIdaFrontDoorHost, normalizeTenantHost } from '@/lib/tenant/tenant-front-door';
import {
  coerceTenantId,
  resolveTenantIdFromSources,
  TENANT_HEADER_NAME,
  type TenantId,
} from '@/lib/tenant/tenant-hosts';

type TenantHintResult =
  | { kind: 'absent' }
  | { kind: 'valid'; tenantId: TenantId }
  | { kind: 'invalid' };

export type SignUpTenantGuardResult =
  | { decision: 'allow' }
  | {
      decision: 'deny';
      code: 'WRONG_TENANT_CONTEXT';
      message: 'Wrong tenant context';
      reason: 'missing_tenant_context' | 'tenant_mismatch';
      resolvedTenantId: TenantId | null;
    };

function getAuthPathname(url: string): string | null {
  return URL.canParse(url) ? new URL(url).pathname : null;
}

function getRequestHost(headers: Headers): string {
  return headers.get('x-forwarded-host') ?? headers.get('host') ?? '';
}

function getDirectRequestHost(headers: Headers): string {
  return headers.get('host') ?? '';
}

function hasUnambiguousFrontDoorHost(headers: Headers): boolean {
  const host = normalizeTenantHost(getDirectRequestHost(headers));
  if (!isKnownIdaFrontDoorHost(host)) return false;

  const forwardedHost = headers.get('x-forwarded-host');
  if (!forwardedHost) return true;

  return normalizeTenantHost(forwardedHost) === host;
}

function readAdditionalData(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const additionalData = (body as { additionalData?: unknown }).additionalData;
  return additionalData && typeof additionalData === 'object'
    ? (additionalData as Record<string, unknown>)
    : null;
}

function resolveSignUpTenantHint(body: unknown): TenantHintResult {
  if (!body || typeof body !== 'object') return { kind: 'absent' };

  const directTenantId = (body as { tenantId?: unknown }).tenantId;
  const additionalTenantId = readAdditionalData(body)?.tenantId;
  const rawTenantId = directTenantId ?? additionalTenantId;
  if (rawTenantId === undefined) return { kind: 'absent' };
  if (typeof rawTenantId !== 'string') return { kind: 'invalid' };

  const tenantId = coerceTenantId(rawTenantId.trim());
  return tenantId ? { kind: 'valid', tenantId } : { kind: 'invalid' };
}

function resolveRequestTenant(headers: Headers, body: unknown): TenantId | null {
  const bodyTenant = resolveSignUpTenantHint(body);
  if (isKnownIdaFrontDoorHost(getDirectRequestHost(headers))) {
    if (!hasUnambiguousFrontDoorHost(headers)) return null;
    return (
      coerceTenantId(headers.get(TENANT_HEADER_NAME)) ??
      (bodyTenant.kind === 'valid' ? bodyTenant.tenantId : null)
    );
  }

  return resolveTenantIdFromSources(
    { host: getRequestHost(headers) },
    { productionSensitive: true, allowLoopbackFallback: true }
  );
}

export function isEmailSignUpUrl(url: string): boolean {
  return getAuthPathname(url)?.endsWith('/api/auth/sign-up/email') ?? false;
}

export function evaluateEmailSignUpTenantGuard(args: {
  url: string;
  headers: Headers;
  body: unknown;
}): SignUpTenantGuardResult | null {
  if (!isEmailSignUpUrl(args.url)) return null;

  const bodyTenant = resolveSignUpTenantHint(args.body);
  if (bodyTenant.kind !== 'valid') {
    return {
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'missing_tenant_context',
      resolvedTenantId: null,
    };
  }

  const resolvedTenantId = resolveRequestTenant(args.headers, args.body);
  if (!resolvedTenantId || resolvedTenantId !== bodyTenant.tenantId) {
    return {
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: resolvedTenantId ? 'tenant_mismatch' : 'missing_tenant_context',
      resolvedTenantId,
    };
  }

  return { decision: 'allow' };
}
