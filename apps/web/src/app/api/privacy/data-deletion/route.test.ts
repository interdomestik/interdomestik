import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  requestDataDeletionCore: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('./_core', () => ({
  requestDataDeletionCore: hoisted.requestDataDeletionCore,
}));

function request(body?: string, headers: HeadersInit = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/privacy/data-deletion', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': ' privacy-agent ',
      'x-forwarded-for': ' 203.0.113.10, 198.51.100.7 ',
      ...headers,
    },
    body,
  });
}

describe('POST /api/privacy/data-deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', role: 'member', tenantId: 'tenant-1' },
    });
    hoisted.requestDataDeletionCore.mockResolvedValue({
      status: 202,
      body: { success: true, requestId: 'req-1', alreadyPending: false },
    });
  });

  it('returns 401 before body parsing when unauthenticated', async () => {
    hoisted.getSession.mockResolvedValue(null);

    const response = await POST(request('{'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ success: false, error: 'Unauthorized' });
    expect(hoisted.requestDataDeletionCore).not.toHaveBeenCalled();
  });

  it.each([
    ['authenticated malformed JSON', '{'],
    ['explicitly empty body', ''],
  ])('treats %s like an empty object', async (_label, body) => {
    const response = await POST(request(body));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-1',
      alreadyPending: false,
    });
    expect(hoisted.requestDataDeletionCore).toHaveBeenCalledWith(
      expect.objectContaining({ reason: undefined })
    );
  });

  it('passes normalized metadata and reason to the core', async () => {
    const response = await POST(request('{"reason":" Delete me "}'));

    expect(response.status).toBe(202);
    expect(hoisted.requestDataDeletionCore).toHaveBeenCalledWith({
      userId: 'user-1',
      tenantId: 'tenant-1',
      actorRole: 'member',
      reason: ' Delete me ',
      ipAddress: '203.0.113.10',
      userAgent: 'privacy-agent',
    });
  });

  it('preserves already-pending 202 semantics from the core', async () => {
    hoisted.requestDataDeletionCore.mockResolvedValue({
      status: 202,
      body: {
        success: true,
        requestId: 'req-existing',
        alreadyPending: true,
        retryAfterDays: 12,
      },
    });

    const response = await POST(request('{}'));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      requestId: 'req-existing',
      alreadyPending: true,
      retryAfterDays: 12,
    });
  });
});
