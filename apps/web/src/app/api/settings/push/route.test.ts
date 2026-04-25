import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, POST } from './route';

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

function authenticatedSession(tenantId: string | null = 'tenant_mk') {
  return { user: { id: 'user-123', tenantId } };
}

function postRequest(body: unknown = validPushBody): Request {
  return new Request('http://localhost:3000/api/settings/push', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deleteRequest(body: unknown = { endpoint: validPushBody.endpoint }): Request {
  return new Request('http://localhost:3000/api/settings/push', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

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

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when tenant identity is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession(null));

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Missing tenant identity' });
    expect(mockSelectChain.from).not.toHaveBeenCalled();
    expect(mockInsertChain.values).not.toHaveBeenCalled();
    expect(mockUpdateChain.set).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await POST(postRequest('invalid json'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 on missing fields', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await POST(postRequest({ endpoint: '' }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid subscription data' });
  });

  it('creates a new subscription when none exists', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockSelectChain.limit.mockResolvedValue([]);

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-123',
        tenantId: 'tenant_mk',
        userId: 'user-123',
        endpoint: validPushBody.endpoint,
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'UA',
      })
    );
  });

  it('updates subscription when it exists', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockSelectChain.limit.mockResolvedValue([
      {
        id: 'sub-1',
        endpoint: validPushBody.endpoint,
        tenantId: 'tenant_mk',
        userId: 'user-123',
      },
    ]);

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_mk',
        userId: 'user-123',
        endpoint: validPushBody.endpoint,
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'UA',
        updatedAt: expect.any(Date),
      })
    );
  });

  it.each([
    ['another user in the same tenant', { tenantId: 'tenant_mk', userId: 'other-user' }],
    ['the same user in another tenant', { tenantId: 'tenant_other', userId: 'user-123' }],
  ])('returns 409 when the endpoint belongs to %s', async (_caseName, owner) => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockSelectChain.limit.mockResolvedValue([
      {
        id: 'sub-1',
        endpoint: validPushBody.endpoint,
        ...owner,
      },
    ]);

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({ error: 'Push subscription endpoint already registered' });
    expect(mockUpdateChain.set).not.toHaveBeenCalled();
    expect(mockInsertChain.values).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 409 when a raced insert finds another endpoint owner', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockSelectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'sub-1',
        endpoint: validPushBody.endpoint,
        tenantId: 'tenant_other',
        userId: 'other-user',
      },
    ]);
    mockInsertChain.values.mockRejectedValueOnce(uniqueViolation);

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({ error: 'Push subscription endpoint already registered' });
    expect(mockInsertChain.values).toHaveBeenCalledTimes(1);
    expect(mockSelectChain.limit).toHaveBeenCalledTimes(2);
    expect(mockUpdateChain.set).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('updates when a raced insert finds the same endpoint owner', async () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockSelectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'sub-1',
        endpoint: validPushBody.endpoint,
        tenantId: 'tenant_mk',
        userId: 'user-123',
      },
    ]);
    mockInsertChain.values.mockRejectedValueOnce(uniqueViolation);

    const response = await POST(postRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockInsertChain.values).toHaveBeenCalledTimes(1);
    expect(mockUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant_mk',
        userId: 'user-123',
        endpoint: validPushBody.endpoint,
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

    const response = await DELETE(deleteRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when tenant identity is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession(null));

    const response = await DELETE(deleteRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toEqual({ error: 'Missing tenant identity' });
    expect(mockDeleteChain.where).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest('invalid json'));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 when endpoint is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: 'Invalid subscription' });
  });

  it('deletes subscription by endpoint', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(mockDeleteChain.where).toHaveBeenCalledWith({
      type: 'and',
      conditions: [
        { type: 'eq', field: 'endpoint', value: validPushBody.endpoint },
        { type: 'eq', field: 'tenant_id', value: 'tenant_mk' },
        { type: 'eq', field: 'user_id', value: 'user-123' },
      ],
    });
  });
});
