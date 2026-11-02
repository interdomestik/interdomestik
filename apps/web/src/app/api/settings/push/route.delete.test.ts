import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from './route';

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

const validDeleteBody = { endpoint: validPushBody.endpoint };
const sameEndpointOwner = { tenantId: 'tenant_mk', userId: 'user-123' };
function authenticatedSession(tenantId: string | null = 'tenant_mk') {
  return { user: { id: 'user-123', tenantId } };
}

function deleteRequest(body: unknown = validDeleteBody): Request {
  return new Request('http://localhost:3000/api/settings/push', {
    method: 'DELETE',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function expectJsonResponse(
  response: Response,
  status: number,
  body: Record<string, unknown>
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
}

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
    expect(readTenantAuthority(mockWithTenantContext.mock.calls[0][0]).tenantId).toBe('tenant_mk');
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
