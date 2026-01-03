import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, POST } from './route';

const hoistedMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoistedMocks.getSession,
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@interdomestik/database', () => ({
  db: {
    select: () => mockSelectChain,
    insert: () => mockInsertChain,
    update: () => mockUpdateChain,
    delete: () => mockDeleteChain,
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  pushSubscriptions: {
    endpoint: 'endpoint',
    tenantId: 'tenant_id',
    userId: 'user_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-123',
}));

vi.mock('next/headers', () => ({
  headers: hoistedMocks.headers,
}));

describe('POST /api/settings/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectChain.from.mockReturnThis();
    mockSelectChain.where.mockReturnThis();
    mockSelectChain.limit.mockResolvedValue([]);
    mockInsertChain.values.mockResolvedValue(undefined);
    mockUpdateChain.set.mockReturnThis();
    mockUpdateChain.where.mockResolvedValue(undefined);
  });

  it('returns 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: 'https://example.com/ep',
        keys: { p256dh: 'p', auth: 'a' },
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'POST',
      body: 'invalid json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 on missing fields', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'POST',
      body: JSON.stringify({ endpoint: '' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid subscription' });
  });

  it('creates a new subscription when none exists', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
    mockSelectChain.limit.mockResolvedValue([]);

    const body = {
      endpoint: 'https://example.com/ep',
      keys: { p256dh: 'p256', auth: 'auth' },
      userAgent: 'UA',
    };

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-123',
        tenantId: 'tenant_mk',
        userId: 'user-123',
        endpoint: body.endpoint,
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'UA',
      })
    );
  });

  it('updates subscription when it exists', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });
    mockSelectChain.limit.mockResolvedValue([{ id: 'sub-1', endpoint: 'https://example.com/ep' }]);

    const body = {
      endpoint: 'https://example.com/ep',
      keys: { p256dh: 'p256', auth: 'auth' },
      userAgent: 'UA',
    };

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_mk',
        userId: 'user-123',
        endpoint: body.endpoint,
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'UA',
        updatedAt: expect.any(Date),
      })
    );
  });
});

describe('DELETE /api/settings/push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteChain.where.mockResolvedValue(undefined);
  });

  it('returns 401 if user is not authenticated', async () => {
    hoistedMocks.getSession.mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: 'https://example.com/ep' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'DELETE',
      body: 'invalid json',
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 when endpoint is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid subscription' });
  });

  it('deletes subscription by endpoint', async () => {
    hoistedMocks.getSession.mockResolvedValue({ user: { id: 'user-123', tenantId: 'tenant_mk' } });

    const request = new Request('http://localhost:3000/api/settings/push', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: 'https://example.com/ep' }),
    });

    const response = await DELETE(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockDeleteChain.where).toHaveBeenCalled();
  });
});
