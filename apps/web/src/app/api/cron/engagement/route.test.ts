import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  authorizeCronRequest: vi.fn(),
  runEngagementCronCore: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimit: hoisted.enforceRateLimit,
}));

vi.mock('../_auth', () => ({
  authorizeCronRequest: hoisted.authorizeCronRequest,
}));

vi.mock('./_core', () => ({
  runEngagementCronCore: hoisted.runEngagementCronCore,
}));

import { GET } from './route';

describe('GET /api/cron/engagement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimit.mockResolvedValue(null);
    hoisted.authorizeCronRequest.mockReturnValue(true);
    hoisted.runEngagementCronCore.mockResolvedValue({
      day7: 0,
      day14: 0,
      day30: 0,
      day60: 0,
      day90: 0,
      seasonal: 0,
      annual: 0,
      skipped: 0,
      errors: 0,
    });
  });

  it('returns early when rate limited', async () => {
    hoisted.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const req = new Request('http://localhost:3000/api/cron/engagement');
    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(await res.text()).toBe('limited');
  });

  it('returns 401 when unauthorized', async () => {
    hoisted.authorizeCronRequest.mockReturnValue(false);

    const req = new Request('http://localhost:3000/api/cron/engagement');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data).toEqual({ error: 'Unauthorized' });
  });

  it('returns success payload when authorized', async () => {
    const req = new Request('http://localhost:3000/api/cron/engagement');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      success: true,
      results: {
        day7: 0,
        day14: 0,
        day30: 0,
        day60: 0,
        day90: 0,
        seasonal: 0,
        annual: 0,
        skipped: 0,
        errors: 0,
      },
    });

    expect(hoisted.runEngagementCronCore).toHaveBeenCalledTimes(1);
    expect(hoisted.runEngagementCronCore).toHaveBeenCalledWith({
      now: expect.any(Date),
      headers: req.headers,
    });
  });
});
