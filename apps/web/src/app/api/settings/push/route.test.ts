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

const validDeleteBody = { endpoint: validPushBody.endpoint };
const sameEndpointOwner = { tenantId: 'tenant_mk', userId: 'user-123' };
const endpointConflict = { error: 'Push subscription endpoint already registered' };
const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });

function authenticatedSession(tenantId: string | null = 'tenant_mk') {
  return { user: { id: 'user-123', tenantId } };
}

function postRequest(body: unknown = validPushBody): Request {
  return new Request('http://localhost:3000/api/settings/push', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deleteRequest(body: unknown = validDeleteBody): Request {
  return new Request('http://localhost:3000/api/settings/push', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function subscriptionFor(owner = sameEndpointOwner) {
  return {
    id: 'sub-1',
    endpoint: validPushBody.endpoint,
    ...owner,
  };
}

async function expectJsonResponse(
  response: Response,
  status: number,
  body: Record<string, unknown>
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
}

function expectNoPushWriteOrAudit() {
  expect(mockInsertChain.values).not.toHaveBeenCalled();
  expect(mockUpdateChain.set).not.toHaveBeenCalled();
  expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
}

function expectValidPushUpdate() {
  expect(mockUpdateChain.set).toHaveBeenCalledWith(
    expect.objectContaining({
      ...sameEndpointOwner,
      endpoint: validPushBody.endpoint,
      p256dh: 'p256',
      auth: 'auth',
      userAgent: 'UA',
      updatedAt: expect.any(Date),
    })
  );
}

function mockExistingSubscription(owner = sameEndpointOwner) {
  mockSelectChain.limit.mockResolvedValue([subscriptionFor(owner)]);
}

function mockRacedInsertSubscription(owner = sameEndpointOwner) {
  mockSelectChain.limit.mockResolvedValueOnce([]).mockResolvedValueOnce([subscriptionFor(owner)]);
  mockInsertChain.values.mockRejectedValueOnce(uniqueViolation);
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
    await expectJsonResponse(response, 401, { error: 'Unauthorized' });
  });

  it('returns 401 when tenant identity is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession(null));

    const response = await POST(postRequest());

    await expectJsonResponse(response, 401, { error: 'Missing tenant identity' });
    expect(mockSelectChain.from).not.toHaveBeenCalled();
    expectNoPushWriteOrAudit();
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await POST(postRequest('invalid json'));
    await expectJsonResponse(response, 400, { error: 'Invalid JSON' });
  });

  it('returns 400 on missing fields', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await POST(postRequest({ endpoint: '' }));
    await expectJsonResponse(response, 400, { error: 'Invalid subscription data' });
  });

  it('creates a new subscription when none exists', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockSelectChain.limit.mockResolvedValue([]);

    const response = await POST(postRequest());

    await expectJsonResponse(response, 200, { success: true });
    expect(mockInsertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'test-id-123',
        ...sameEndpointOwner,
        endpoint: validPushBody.endpoint,
        p256dh: 'p256',
        auth: 'auth',
        userAgent: 'UA',
      })
    );
  });

  it('updates subscription when it exists', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockExistingSubscription();

    const response = await POST(postRequest());
    await expectJsonResponse(response, 200, { success: true });
    expectValidPushUpdate();
  });

  it.each([
    ['another user in the same tenant', { tenantId: 'tenant_mk', userId: 'other-user' }],
    ['the same user in another tenant', { tenantId: 'tenant_other', userId: 'user-123' }],
  ])('returns 409 when the endpoint belongs to %s', async (_caseName, owner) => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockExistingSubscription(owner);

    const response = await POST(postRequest());

    await expectJsonResponse(response, 409, endpointConflict);
    expectNoPushWriteOrAudit();
  });

  it('returns 409 when a raced insert finds another endpoint owner', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockRacedInsertSubscription({ tenantId: 'tenant_other', userId: 'other-user' });

    const response = await POST(postRequest());

    await expectJsonResponse(response, 409, endpointConflict);
    expect(mockInsertChain.values).toHaveBeenCalledTimes(1);
    expect(mockSelectChain.limit).toHaveBeenCalledTimes(2);
    expect(mockUpdateChain.set).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('updates when a raced insert finds the same endpoint owner', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());
    mockRacedInsertSubscription();

    const response = await POST(postRequest());
    await expectJsonResponse(response, 200, { success: true });
    expect(mockInsertChain.values).toHaveBeenCalledTimes(1);
    expectValidPushUpdate();
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
    await expectJsonResponse(response, 401, { error: 'Unauthorized' });
  });

  it('returns 401 when tenant identity is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession(null));

    const response = await DELETE(deleteRequest());

    await expectJsonResponse(response, 401, { error: 'Missing tenant identity' });
    expect(mockDeleteChain.where).not.toHaveBeenCalled();
    expect(hoistedMocks.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest('invalid json'));
    await expectJsonResponse(response, 400, { error: 'Invalid JSON' });
  });

  it('returns 400 when endpoint is missing', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest({}));
    await expectJsonResponse(response, 400, { error: 'Invalid subscription' });
  });

  it('deletes subscription by endpoint', async () => {
    hoistedMocks.getSession.mockResolvedValue(authenticatedSession());

    const response = await DELETE(deleteRequest());

    await expectJsonResponse(response, 200, { success: true });
    expect(mockDeleteChain.where).toHaveBeenCalledWith({
      type: 'and',
      conditions: [
        { type: 'eq', field: 'endpoint', value: validPushBody.endpoint },
        { type: 'eq', field: 'tenant_id', value: sameEndpointOwner.tenantId },
        { type: 'eq', field: 'user_id', value: sameEndpointOwner.userId },
      ],
    });
  });
});
