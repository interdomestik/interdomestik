import { createHash } from 'node:crypto';

import { isCountryHostLiveLoginBlocked } from '@/lib/tenant/ida-live-login-cutover';
import { isKnownIdaFrontDoorHost, normalizeTenantHost } from '@/lib/tenant/tenant-front-door';
import {
  coerceTenantId,
  resolveTenantIdFromSources,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantId,
} from '@/lib/tenant/tenant-hosts';

import { resolveNeutralEmailSignInHost } from './neutral-email-sign-in-admission';
import { evaluateNeutralSingleEntryEmailSignIn } from './neutral-email-sign-in-guard';
import { resolveSignInTenantContext } from './sign-in-tenant-hint';

// The neutral single-entry decision lives in its own route-local module; it stays importable from
// here so the route and existing contracts keep one auth-core surface.
export { evaluateNeutralSingleEntryEmailSignIn };
export type { NeutralSingleEntryDecision } from './neutral-email-sign-in-guard';

export type AuthMethod = 'GET' | 'POST';
export type AuthRateLimitConfig = { name: string; limit: number; windowSeconds: number };

const EMAIL_SIGN_IN_PATH_SUFFIX = '/api/auth/sign-in/email';

const getAuthPathname = (url: string): string | null =>
  URL.canParse(url) ? new URL(url).pathname : null;

export function getAuthRateLimitConfig(method: AuthMethod, url: string): AuthRateLimitConfig {
  const pathname = getAuthPathname(url);

  if (pathname?.endsWith('/api/auth/get-session')) {
    return { name: 'api/auth/get-session', limit: 180, windowSeconds: 60 };
  }

  if (pathname?.endsWith('/api/auth/sign-out')) {
    return { name: 'api/auth/sign-out', limit: 20, windowSeconds: 60 };
  }

  if (pathname?.endsWith(EMAIL_SIGN_IN_PATH_SUFFIX)) {
    return { name: 'api/auth/sign-in/email', limit: 20, windowSeconds: 60 };
  }

  switch (method) {
    case 'GET':
      return { name: 'api/auth', limit: 10, windowSeconds: 60 };
    case 'POST':
      return { name: 'api/auth', limit: 5, windowSeconds: 60 };
  }
}

export function getAuthRateLimitKeySuffix(args: {
  method: AuthMethod;
  url: string;
  headers: Headers;
  body: unknown;
}): string | null {
  const { method, url, headers, body } = args;
  if (method !== 'POST' || !isEmailSignInUrl(url)) {
    return null;
  }

  const email = extractEmailFromSignInBody(body);
  if (!email) {
    return null;
  }

  // Admission alone owns this bucket: untrusted tenant and booking hints cannot multiply
  // attempts against one account. Their independent validation still happens in the guard.
  if (resolveNeutralEmailSignInHost(headers) === 'admitted') {
    const digest = createHash('sha256').update(email).digest('hex').slice(0, 20);
    return `neutral:email_hash:${digest}`;
  }

  const tenantId = resolveTenantIdForEmailSignIn(headers, body);
  if (!tenantId) {
    return null;
  }

  const digest = createHash('sha256').update(`${tenantId}|${email}`).digest('hex').slice(0, 20);
  return `tenant:${tenantId}:email_hash:${digest}`;
}

export type PasswordResetAuditEvent = {
  action: 'auth.password_reset_requested';
  entityType: 'auth';
  metadata: { route: '/api/auth/request-password-reset' };
};

export type SignInTenantGuardResult =
  | { decision: 'allow' }
  | {
      decision: 'deny';
      code: 'WRONG_TENANT_CONTEXT';
      message: 'Wrong tenant context';
      reason: 'missing_tenant_context' | 'tenant_mismatch';
      resolvedTenantId: TenantId | null;
    };

function parseCookieValue(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const entry of cookies) {
    const [rawName, ...rest] = entry.trim().split('=');
    if (rawName !== cookieName) continue;
    const value = rest.join('=').trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function getRequestHost(headers: Headers): string {
  return headers.get('x-forwarded-host') ?? headers.get('host') ?? '';
}

function getDirectRequestHost(headers: Headers): string {
  return headers.get('host') ?? '';
}

function hasKnownDirectFrontDoorHost(headers: Headers): boolean {
  return isKnownIdaFrontDoorHost(getDirectRequestHost(headers));
}

function hasUnambiguousFrontDoorHost(headers: Headers): boolean {
  const host = normalizeTenantHost(getDirectRequestHost(headers));
  if (!isKnownIdaFrontDoorHost(host)) return false;

  const forwardedHost = headers.get('x-forwarded-host');
  if (!forwardedHost) return true;

  return normalizeTenantHost(forwardedHost) === host;
}

function resolveFrontDoorTenantHint(headers: Headers, body?: unknown): TenantId | null {
  if (!hasUnambiguousFrontDoorHost(headers)) return null;

  const explicitContext = resolveSignInTenantContext(headers, body);
  if (explicitContext.kind === 'invalid') return null;
  if (explicitContext.kind === 'valid') return explicitContext.tenantId;

  return coerceTenantId(parseCookieValue(headers.get('cookie'), TENANT_COOKIE_NAME));
}

export function resolveTenantIdForPasswordResetAudit(
  url: string,
  headers: Headers
): TenantId | null {
  let queryTenantId: string | null = null;

  try {
    queryTenantId = new URL(url).searchParams.get('tenantId');
  } catch {
    // ignore malformed URL and fall through to null
  }

  if (hasKnownDirectFrontDoorHost(headers)) {
    return resolveFrontDoorTenantHint(headers);
  }

  return resolveTenantIdFromSources(
    {
      host: getRequestHost(headers),
      cookieTenantId: parseCookieValue(headers.get('cookie'), TENANT_COOKIE_NAME),
      headerTenantId: headers.get(TENANT_HEADER_NAME),
      queryTenantId,
    },
    { productionSensitive: true, allowLoopbackFallback: true }
  );
}

export function isEmailSignInUrl(url: string): boolean {
  const pathname = getAuthPathname(url);
  return pathname?.endsWith(EMAIL_SIGN_IN_PATH_SUFFIX) ?? false;
}

export function resolveTenantIdForEmailSignIn(headers: Headers, body?: unknown): TenantId | null {
  if (isCountryHostLiveLoginBlocked(getDirectRequestHost(headers))) {
    return null;
  }

  if (hasKnownDirectFrontDoorHost(headers)) {
    return resolveFrontDoorTenantHint(headers, body);
  }

  return resolveTenantIdFromSources(
    {
      host: getRequestHost(headers),
      cookieTenantId: parseCookieValue(headers.get('cookie'), TENANT_COOKIE_NAME),
      headerTenantId: headers.get(TENANT_HEADER_NAME),
    },
    { productionSensitive: true, allowLoopbackFallback: true }
  );
}

function denyMissingTenantContext(): SignInTenantGuardResult {
  return {
    decision: 'deny',
    code: 'WRONG_TENANT_CONTEXT',
    message: 'Wrong tenant context',
    reason: 'missing_tenant_context',
    resolvedTenantId: null,
  };
}

export function extractEmailFromSignInBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as { email?: unknown }).email;
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export async function evaluateEmailSignInTenantGuard(args: {
  url: string;
  headers: Headers;
  body: unknown;
  lookupUserTenantByEmail: (email: string) => Promise<TenantId | null>;
}): Promise<SignInTenantGuardResult | null> {
  const { url, headers, body, lookupUserTenantByEmail } = args;
  if (!isEmailSignInUrl(url)) return null;

  const neutralEntry = evaluateNeutralSingleEntryEmailSignIn(headers, body);
  // Delegate to the unchanged provider handler, which verifies credentials and establishes
  // tenant/role from the stored identity. No pre-auth email lookup happens on this path.
  if (neutralEntry.kind === 'delegate_to_provider') return { decision: 'allow' };
  // An unusable explicit context, or a neutral candidate host that is not an exact admitted entry,
  // fails closed here instead of falling back to the loose legacy host/cookie comparison.
  if (neutralEntry.kind === 'reject') return denyMissingTenantContext();

  // On an admitted neutral host the parsed explicit tenant is the comparison authority; everything
  // else keeps the established host/cookie/header resolution.
  const resolvedTenantId =
    neutralEntry.kind === 'compare_explicit_tenant'
      ? neutralEntry.tenantId
      : resolveTenantIdForEmailSignIn(headers, body);
  if (!resolvedTenantId) return denyMissingTenantContext();

  const email = extractEmailFromSignInBody(body);
  if (!email) return { decision: 'allow' };

  const userTenantId = await lookupUserTenantByEmail(email);
  if (!userTenantId) return { decision: 'allow' };

  if (userTenantId !== resolvedTenantId) {
    return {
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'tenant_mismatch',
      resolvedTenantId,
    };
  }

  return { decision: 'allow' };
}

export function getPasswordResetAuditEventFromUrl(url: string): PasswordResetAuditEvent | null {
  try {
    const pathname = new URL(url).pathname;

    // Record reset-password request intent for incident forensics (no PII).
    if (pathname.endsWith('/api/auth/request-password-reset')) {
      return {
        action: 'auth.password_reset_requested',
        entityType: 'auth',
        metadata: { route: '/api/auth/request-password-reset' },
      };
    }

    return null;
  } catch {
    return null;
  }
}
