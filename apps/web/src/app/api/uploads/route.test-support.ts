import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  findClaimFirst: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));
vi.mock('nanoid', () => ({
  nanoid: () => 'evidence-123',
}));
vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  eq: vi.fn(),
  claims: { id: 'id', tenantId: 'tenant_id' },
  db: {
    query: {
      claims: {
        findFirst: hoisted.findClaimFirst,
      },
    },
  },
  withTenantContext: async (
    _context: unknown,
    callback: (tx: { query: { claims: { findFirst: typeof hoisted.findClaimFirst } } }) => unknown
  ) => callback({ query: { claims: { findFirst: hoisted.findClaimFirst } } }),
  createAdminClient: () => ({
    storage: {
      from: hoisted.storageFrom,
    },
  }),
}));

export { hoisted };
