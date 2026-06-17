import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const routeDoubles = vi.hoisted(() => ({
  createPack: vi.fn(),
  readPack: vi.fn(),
  readSession: vi.fn(),
  readHeaders: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock('@/features/share-pack/share-pack.service', () => ({
  createSharePack: routeDoubles.createPack,
  getSharePack: routeDoubles.readPack,
  logAuditEvent: routeDoubles.writeAudit,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: routeDoubles.readSession,
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: routeDoubles.readHeaders,
}));

type SharePackPostRequest = Parameters<typeof POST>[0];

function request(body: string): SharePackPostRequest {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  headers.set('user-agent', ' vitest-agent ');
  headers.set('x-forwarded-for', ' 203.0.113.10, 198.51.100.7 ');

  return new Request('http://localhost:3000/api/share-pack', {
    method: 'POST',
    headers,
    body,
  }) as SharePackPostRequest;
}

describe('POST /api/share-pack request guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeDoubles.readHeaders.mockResolvedValue(new Headers());
    routeDoubles.readSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant-1' } });
    routeDoubles.createPack.mockResolvedValue({
      packId: 'pack-1',
      token: 'share-token',
      expiresAt: new Date('2026-04-25T12:00:00.000Z'),
    });
    routeDoubles.writeAudit.mockResolvedValue(undefined);
  });

  it('returns invalid_json after auth for malformed JSON', async () => {
    const response = await POST(request('{'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: 'Invalid JSON',
      code: 'invalid_json',
    });
    expect(routeDoubles.createPack).not.toHaveBeenCalled();
  });

  it('keeps auth before body parsing', async () => {
    routeDoubles.readSession.mockResolvedValue(null);

    const response = await POST(request('{'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(routeDoubles.createPack).not.toHaveBeenCalled();
  });

  it('keeps the legacy invalid-shape response text', async () => {
    const response = await POST(request('{"documentIds":[7]}'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'IDs required' });
    expect(routeDoubles.createPack).not.toHaveBeenCalled();
  });

  it('passes normalized client metadata to audit logging', async () => {
    const response = await POST(request('{"documentIds":["doc-1"]}'));

    expect(response.status).toBe(200);
    expect(routeDoubles.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '203.0.113.10',
        userAgent: 'vitest-agent',
      })
    );
  });
});
