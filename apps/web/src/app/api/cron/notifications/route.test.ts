import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({ schedule: vi.fn(), rateLimit: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.rateLimit }));
vi.mock('@/lib/notification-delivery-schedule', () => ({
  runNotificationDeliverySchedule: mocks.schedule,
}));

function request(authorization?: string) {
  return new NextRequest('http://localhost/api/cron/notifications', {
    headers: authorization ? { authorization } : undefined,
  });
}

describe('GET /api/cron/notifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-notification-cron-secret');
    mocks.rateLimit.mockResolvedValue(null);
    mocks.schedule.mockResolvedValue({ tenantFailures: 0 });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns 401 when unauthorized', async () => {
    for (const authorization of [undefined, 'Bearer wrong']) {
      expect((await GET(request(authorization))).status).toBe(401);
    }
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('does not admit a request when the secret is unconfigured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request('Bearer test-notification-cron-secret'))).status).toBe(401);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('starts the schedule with a verified secret', async () => {
    expect((await GET(request('Bearer test-notification-cron-secret'))).status).toBe(200);
    expect(mocks.schedule).toHaveBeenCalledOnce();
  });
});
