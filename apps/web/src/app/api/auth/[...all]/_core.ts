import {
  resolveTenantIdFromSources,
  TENANT_COOKIE_NAME,
  TENANT_HEADER_NAME,
  type TenantId,
} from '@/lib/tenant/tenant-hosts';

export type AuthMethod = 'GET' | 'POST';

function getAuthPathname(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

export function getAuthRateLimitConfig(
  method: AuthMethod,
  url: string
): {
  name: string;
  limit: number;
  windowSeconds: number;
} {
  const pathname = getAuthPathname(url);

  if (pathname?.endsWith('/api/auth/get-session')) {
    return { name: 'api/auth/get-session', limit: 180, windowSeconds: 60 };
  }

  if (pathname?.endsWith('/api/auth/sign-out')) {
    return { name: 'api/auth/sign-out', limit: 20, windowSeconds: 60 };
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
  if (method !== 'POST' || !isEmailPasswordSignInUrl(url)) {
    return null;
  }

  const email = extractEmailFromSignInBody(body);
  if (!email) {
    return null;
  }

  const tenantId = resolveTenantIdForEmailSignIn(headers) ?? 'unknown-tenant';
  return `tenant:${tenantId}:email:${email}`;
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

  return resolveTenantIdFromSources(
    {
      host: getRequestHost(headers),
      cookieTenantId: parseCookieValue(headers.get('cookie'), TENANT_COOKIE_NAME),
      headerTenantId: headers.get(TENANT_HEADER_NAME),
      queryTenantId,
    },
    { productionSensitive: true }
  );
}

export function isEmailPasswordSignInUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith('/api/auth/sign-in/email');
  } catch {
    return false;
  }
}

export function resolveTenantIdForEmailSignIn(headers: Headers): TenantId | null {
  return resolveTenantIdFromSources(
    {
      host: getRequestHost(headers),
      cookieTenantId: parseCookieValue(headers.get('cookie'), TENANT_COOKIE_NAME),
      headerTenantId: headers.get(TENANT_HEADER_NAME),
    },
    { productionSensitive: true }
  );
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
  if (!isEmailPasswordSignInUrl(url)) return null;

  const resolvedTenantId = resolveTenantIdForEmailSignIn(headers);
  if (!resolvedTenantId) {
    return {
      decision: 'deny',
      code: 'WRONG_TENANT_CONTEXT',
      message: 'Wrong tenant context',
      reason: 'missing_tenant_context',
      resolvedTenantId: null,
    };
  }

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
