import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  authorizeCronRequest: vi.fn(),
  runNpsCronCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('../_auth', () => ({
  authorizeCronRequest: hoisted.authorizeCronRequest,
}));

vi.mock('./_core', () => ({
  runNpsCronCore: hoisted.runNpsCronCore,
}));

import { GET } from './route';

describe('GET /api/cron/nps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(true);
    hoisted.runNpsCronCore.mockResolvedValue({ sent: 1, skipped: 2, errors: 0 });
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/cron/nps');
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('returns 401 when unauthorized', async () => {
    hoisted.authorizeCronRequest.mockReturnValue(false);

    const req = new Request('http://localhost:3000/api/cron/nps');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns success payload when authorized', async () => {
    const req = new Request('http://localhost:3000/api/cron/nps');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ success: true, results: { sent: 1, skipped: 2, errors: 0 } });

    expect(hoisted.runNpsCronCore).toHaveBeenCalledTimes(1);
    expect(hoisted.runNpsCronCore).toHaveBeenCalledWith({
      now: expect.any(Date),
      headers: req.headers,
    });
  });
});
