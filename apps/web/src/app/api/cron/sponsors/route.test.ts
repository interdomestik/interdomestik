import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(async () => null),
  runSponsorCronCore: vi.fn(async () => []),
}));

vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('./sponsor-cron.core', () => ({ runSponsorCronCore: mocks.runSponsorCronCore }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('returns 401 when unauthorized', async () => {
  const url = 'http://localhost/api/cron/sponsors';
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'Unauthorized' });

  const wrongBearer = await GET(
    new NextRequest(url, { headers: { authorization: 'Bearer wrong' } })
  );
  expect(wrongBearer.status).toBe(401);
  expect(mocks.runSponsorCronCore).not.toHaveBeenCalled();
});

it('hands an admitted bearer to the existing sponsor core', async () => {
  const response = await GET(
    new NextRequest('http://localhost/api/cron/sponsors', {
      headers: { authorization: 'Bearer synthetic-cron' },
    })
  );
  expect(response.status).toBe(200);
  expect(mocks.runSponsorCronCore).toHaveBeenCalledExactlyOnceWith({
    ingress: expect.any(Object),
    now: expect.any(Date),
  });
});
