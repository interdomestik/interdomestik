import * as ingress from '@interdomestik/database/ingress';
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

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns 401 when unauthorized', async () => {
    for (const authorization of [undefined, 'Bearer wrong']) {
      expect((await GET(request(authorization))).status).toBe(401);
    }
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])('refuses without a configured secret (%j)', async secret => {
    vi.stubEnv('CRON_SECRET', secret);
    expect((await GET(request('Bearer test-notification-cron-secret'))).status).toBe(401);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('does not drain when rate limited even with a valid bearer', async () => {
    const limited = new Response(null, { status: 429 });
    mocks.rateLimit.mockResolvedValueOnce(limited);

    expect(await GET(request('Bearer test-notification-cron-secret'))).toBe(limited);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it('starts the schedule with a verified secret', async () => {
    const admit = vi.spyOn(ingress, 'admitCronRequest');
    const authorization = 'Bearer test-notification-cron-secret';

    expect((await GET(request(authorization))).status).toBe(200);
    expect(admit).toHaveBeenCalledExactlyOnceWith(authorization);
    expect(mocks.schedule).toHaveBeenCalledOnce();
    const verifiedCapability = admit.mock.results[0].value;
    expect(verifiedCapability).toBeTruthy();
    expect(mocks.schedule.mock.calls[0]).toHaveLength(1);
    expect(mocks.schedule.mock.calls[0][0]).toBe(verifiedCapability);
  });

  it('returns 500 and preserves the summary when a tenant fails', async () => {
    const summary = { tenantFailures: 1, tenants: 2, sent: 3 };
    mocks.schedule.mockResolvedValueOnce(summary);

    const response = await GET(request('Bearer test-notification-cron-secret'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, ...summary });
  });

  it('returns a generic 500 when the schedule throws', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.schedule.mockRejectedValueOnce(new Error('synthetic schedule error'));

    const response = await GET(request('Bearer test-notification-cron-secret'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(log).toHaveBeenCalledWith('[Notification cron] Run failed', expect.any(Error));
  });
});
