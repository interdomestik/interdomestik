import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  appendAnonymousTenantAuditEvent: vi.fn(),
  handlerGET: vi.fn(),
  handlerPOST: vi.fn(),
  lookupUserTenantByEmail: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: hoisted.enforceRateLimit }));
vi.mock('@interdomestik/database', () => ({
  appendAnonymousTenantAuditEvent: hoisted.appendAnonymousTenantAuditEvent,
}));
vi.mock('@/lib/audit.core', () => ({
  extractRequestMetadata: (headers: Headers) => ({
    ip: headers.get('x-forwarded-for') ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
  }),
}));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/auth/tenant-lookup', () => ({
  lookupUserTenantByEmail: hoisted.lookupUserTenantByEmail,
}));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({ GET: hoisted.handlerGET, POST: hoisted.handlerPOST }),
}));

export const NEUTRAL_HOST = 'www.interdomestik.com';
export const MEMBER_EMAIL = 'member.mk@interdomestik.test';

export type SignInRequestOptions = {
  host?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
};

export function buildSignInRequest(options: SignInRequestOptions = {}): Request {
  const host = options.host ?? NEUTRAL_HOST;
  const path = options.path ?? '/api/auth/sign-in/email';

  return new Request(`https://${host}${path}`, {
    method: 'POST',
    headers: {
      host,
      'content-type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(options.body ?? { email: MEMBER_EMAIL, password: 'provider-verifies' }),
  });
}

export { hoisted };
