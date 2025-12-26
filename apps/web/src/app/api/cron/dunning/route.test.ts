import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  authorizeCronRequest: vi.fn(),
  runDunningCronCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('../_auth', () => ({
  authorizeCronRequest: hoisted.authorizeCronRequest,
}));

vi.mock('./_core', () => ({
  runDunningCronCore: hoisted.runDunningCronCore,
}));

import { GET } from './route';

describe('GET /api/cron/dunning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(true);
    hoisted.runDunningCronCore.mockResolvedValue({
      stats: { checked: 1, day7Sent: 0, day13Sent: 0, errors: 0 },
    });
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/cron/dunning');
    const res = await GET(req as any);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('returns 401 when unauthorized', async () => {
    hoisted.authorizeCronRequest.mockReturnValue(false);

    const req = new Request('http://localhost:3000/api/cron/dunning');
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns success payload when authorized', async () => {
    const req = new Request('http://localhost:3000/api/cron/dunning');
    const res = await GET(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        success: true,
        stats: { checked: 1, day7Sent: 0, day13Sent: 0, errors: 0 },
        timestamp: expect.any(String),
      })
    );

    expect(hoisted.runDunningCronCore).toHaveBeenCalledTimes(1);
    expect(hoisted.runDunningCronCore).toHaveBeenCalledWith({ now: expect.any(Date) });
  });
});
