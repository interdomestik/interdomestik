import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

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
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnValue([]),
};

const mockInsertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};

const mockUpdateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue(undefined),
};

const mockTenantTx = {
  select: () => mockSelectChain,
  insert: () => mockInsertChain,
  update: () => mockUpdateChain,
};
const mockWithTenantContext = vi.fn(
  async (_context: { tenantId: string }, action: (tx: typeof mockTenantTx) => Promise<unknown>) =>
    action(mockTenantTx)
);

vi.mock('@interdomestik/database', () => ({
  withTenantContext: (
    context: { tenantId: string },
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

async function expectMissingTenantIdentity(response: Response): Promise<void> {
  const data = await response.json();

  expect(response.status).toBe(401);
  expect(data).toEqual({ error: 'Missing tenant identity' });
  expect(mockSelectChain.from).not.toHaveBeenCalled();
  expect(mockInsertChain.values).not.toHaveBeenCalled();
  expect(mockUpdateChain.set).not.toHaveBeenCalled();
}

describe('GET /api/settings/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.limit.mockReturnValue([]);
  });

  it('should return 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('should return 401 if the session is missing tenant identity', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: null },
    });

    const request = new Request('http://localhost:3000/api/settings/notifications');
    await expectMissingTenantIdentity(await GET(request));
  });

  it('should return default preferences if none exist', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([]);

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      emailClaimUpdates: true,
      emailMarketing: false,
      emailNewsletter: true,
      pushClaimUpdates: true,
      pushMessages: true,
      inAppAll: true,
    });
  });

  it('should return existing preferences', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockReturnValue([
      {
        emailClaimUpdates: false,
        emailMarketing: true,
        emailNewsletter: false,
        pushClaimUpdates: false,
        pushMessages: false,
        inAppAll: false,
      },
    ]);

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      emailClaimUpdates: false,
      emailMarketing: true,
      emailNewsletter: false,
      pushClaimUpdates: false,
      pushMessages: false,
      inAppAll: false,
    });
  });

  it('should handle database errors gracefully', async () => {
    hoistedMocks.getSession.mockResolvedValue({
      user: { id: 'user-123', tenantId: 'tenant_mk' },
    });
    mockSelectChain.limit.mockRejectedValue(new Error('DB Error'));

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = new Request('http://localhost:3000/api/settings/notifications');
    const response = await GET(request);
    const data = await response.json();

    consoleErrorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(data).toEqual({ error: 'Failed to fetch preferences' });
  });
});
