import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  appendAnonymousTenantAuditEvent: vi.fn(),
  handlerGET: vi.fn(),
  handlerPOST: vi.fn(),
  publicIntakeOpen: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));
vi.mock('@/lib/tenant/public-intake-admission', () => ({
  isPublicIntakeOpenForTenant: hoisted.publicIntakeOpen,
}));

vi.mock('@interdomestik/database', () => ({
  appendAnonymousTenantAuditEvent: hoisted.appendAnonymousTenantAuditEvent,
}));

vi.mock('@/lib/audit.core', () => ({
  extractRequestMetadata: (headers: Headers) => ({
    ip: headers.get('x-forwarded-for') ?? undefined,
    userAgent: headers.get('user-agent') ?? undefined,
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: {},
}));

vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: () => ({
    GET: hoisted.handlerGET,
    POST: hoisted.handlerPOST,
  }),
}));

export { hoisted };
