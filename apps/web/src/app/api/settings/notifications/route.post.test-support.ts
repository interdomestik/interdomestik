import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import { expect, vi } from 'vitest';

// Hoisted mocks
const hoistedMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbSelect: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
  headers: vi.fn(),
}));

// Mock auth
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoistedMocks.getSession,
    },
  },
}));

// Mock database
export const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnValue([]),
};

export const mockInsertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};

export const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};

export const mockTenantTx = {
  select: () => mockSelectChain,
  insert: () => mockInsertChain,
  update: () => mockUpdateChain,
};
export const mockWithTenantContext = vi.fn(
  async (_context: TenantAuthority, action: (tx: typeof mockTenantTx) => Promise<unknown>) =>
    action(mockTenantTx)
);

vi.mock('@interdomestik/database', () => ({
  withTenantContext: (
    context: TenantAuthority,
    action: (tx: typeof mockTenantTx) => Promise<unknown>
  ) => mockWithTenantContext(context, action),
  userNotificationPreferences: {
    id: 'id',
    userId: 'user_id',
    tenantId: 'tenant_id',
    emailClaimUpdates: 'email_claim_updates',
    emailMarketing: 'email_marketing',
    emailNewsletter: 'email_newsletter',
    pushClaimUpdates: 'push_claim_updates',
    pushMessages: 'push_messages',
    inAppAll: 'in_app_all',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('drizzle-orm', async importOriginal => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();

  return {
    ...actual,
    eq: vi.fn(),
    and: vi.fn(),
    relations: vi.fn(),
  };
});

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-123',
}));

vi.mock('next/headers', () => ({
  headers: hoistedMocks.headers,
}));

export const samplePreferences = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: true,
  pushClaimUpdates: true,
  pushMessages: true,
  inAppAll: true,
};

export function notificationPostRequest(body = samplePreferences): Request {
  return new Request('http://localhost:3000/api/settings/notifications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function expectMissingTenantIdentity(response: Response): Promise<void> {
  const data = await response.json();

  expect(response.status).toBe(401);
  expect(data).toEqual({ error: 'Missing tenant identity' });
  expect(mockSelectChain.from).not.toHaveBeenCalled();
  expect(mockInsertChain.values).not.toHaveBeenCalled();
  expect(mockUpdateChain.set).not.toHaveBeenCalled();
}

export { hoistedMocks };
