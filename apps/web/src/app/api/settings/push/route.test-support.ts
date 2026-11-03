import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { vi } from 'vitest';

const hoistedMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  eq: vi.fn((field: unknown, value: unknown) => ({ type: 'eq', field, value })),
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoistedMocks.getSession,
    },
  },
}));
vi.mock('@/lib/audit', () => ({
  logAuditEvent: hoistedMocks.logAuditEvent,
}));
vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
};
const mockInsertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};
const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};
const mockDeleteChain = {
  where: vi.fn().mockResolvedValue(undefined),
};
const mockTenantTx = {
  select: () => mockSelectChain,
  insert: () => mockInsertChain,
  update: () => mockUpdateChain,
  delete: () => mockDeleteChain,
};
const mockWithTenantContext = vi.fn(
  async (_context: TenantAuthority, action: (tx: typeof mockTenantTx) => Promise<unknown>) =>
    action(mockTenantTx)
);
vi.mock('@interdomestik/database', () => ({
  withTenantContext: (
    context: TenantAuthority,
    action: (tx: typeof mockTenantTx) => Promise<unknown>
  ) => mockWithTenantContext(context, action),
}));
vi.mock('@interdomestik/database/schema', () => ({
  pushSubscriptions: {
    endpoint: 'endpoint',
    tenantId: 'tenant_id',
    userId: 'user_id',
  },
}));
vi.mock('drizzle-orm', () => ({
  eq: hoistedMocks.eq,
  and: hoistedMocks.and,
}));
vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-123',
}));
vi.mock('next/headers', () => ({
  headers: hoistedMocks.headers,
}));
const validPushBody = {
  endpoint: 'https://example.com/ep',
  keys: { p256dh: 'p256', auth: 'auth' },
  userAgent: 'UA',
};

export {
  hoistedMocks,
  mockSelectChain,
  mockInsertChain,
  mockUpdateChain,
  mockDeleteChain,
  mockTenantTx,
  mockWithTenantContext,
  validPushBody,
};
