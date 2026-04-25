import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const hoisted = vi.hoisted(() => ({
  createSharePack: vi.fn(),
  getSharePack: vi.fn(),
  getSession: vi.fn(),
  headers: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('@/features/share-pack/share-pack.service', () => ({
  createSharePack: hoisted.createSharePack,
  getSharePack: hoisted.getSharePack,
  logAuditEvent: hoisted.logAuditEvent,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: hoisted.headers,
}));

type SharePackPostRequest = Parameters<typeof POST>[0];

const defaultSharePackBody = { documentIds: ['doc-1', 'doc-2'] };

function sharePackRequest(body?: unknown): SharePackPostRequest {
  return new Request('http://localhost:3000/api/share-pack', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'vitest-agent',
      'x-forwarded-for': '127.0.0.1',
    },
    body: JSON.stringify(body ?? defaultSharePackBody),
  }) as SharePackPostRequest;
}

function session(user?: { id?: string; tenantId?: string | null }) {
  const baseUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
  };

  return {
    user: user ? { ...baseUser, ...user } : baseUser,
  };
}

async function expectJson(response: Response, status: number, body: Record<string, unknown>) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual(body);
}

describe('POST /api/share-pack', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.headers.mockResolvedValue(new Headers());
    hoisted.createSharePack.mockResolvedValue({
      packId: 'pack-1',
      token: 'share-token',
      expiresAt: new Date('2026-04-25T12:00:00.000Z'),
    });
    hoisted.logAuditEvent.mockResolvedValue(undefined);
  });

  it('returns 401 when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const response = await POST(sharePackRequest());

    await expectJson(response, 401, { error: 'Unauthorized' });
    expect(hoisted.createSharePack).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 401 when the session has no user payload', async () => {
    hoisted.getSession.mockResolvedValue({});

    const response = await POST(sharePackRequest());

    await expectJson(response, 401, { error: 'Unauthorized' });
    expect(hoisted.createSharePack).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ''])(
    'returns 401 when tenant identity is missing or malformed (%s)',
    async tenantId => {
      hoisted.getSession.mockResolvedValue(session({ tenantId }));

      const response = await POST(sharePackRequest());

      await expectJson(response, 401, { error: 'Missing tenant identity' });
      expect(hoisted.createSharePack).not.toHaveBeenCalled();
      expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
    }
  );

  it('returns 400 when document IDs are missing', async () => {
    hoisted.getSession.mockResolvedValue(session());

    const response = await POST(sharePackRequest({ documentIds: [] }));

    await expectJson(response, 400, { error: 'IDs required' });
    expect(hoisted.createSharePack).not.toHaveBeenCalled();
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('returns 403 when the share-pack service rejects document IDs', async () => {
    hoisted.getSession.mockResolvedValue(session());
    hoisted.createSharePack.mockRejectedValue(new Error('Invalid IDs'));

    const response = await POST(sharePackRequest({ documentIds: ['doc-other-tenant'] }));

    await expectJson(response, 403, { error: 'Invalid IDs' });
    expect(hoisted.logAuditEvent).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped share pack for an authorized session', async () => {
    hoisted.getSession.mockResolvedValue(session());

    const response = await POST(sharePackRequest());

    await expectJson(response, 200, {
      packId: 'pack-1',
      token: 'share-token',
      expiresAt: new Date('2026-04-25T12:00:00.000Z').getTime(),
      validUntil: '2026-04-25T12:00:00.000Z',
    });
    expect(hoisted.createSharePack).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      userId: 'user-1',
      documentIds: ['doc-1', 'doc-2'],
    });
    expect(hoisted.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        ids: ['doc-1', 'doc-2'],
        accessedBy: 'user-1',
        shareToken: 'share-token',
        ipAddress: '127.0.0.1',
        userAgent: 'vitest-agent',
      })
    );
  });
});
