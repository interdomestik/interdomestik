import { expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  runEngagementCronCore: vi.fn(),
}));

vi.mock('../_auth', () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('./_core', () => ({ runEngagementCronCore: mocks.runEngagementCronCore }));

it('returns 410 without running the engagement job', async () => {
  const request = new Request('http://localhost/api/cron/engagement');
  const response = GET(request);
  expect(response.status).toBe(410);

  const withBearer = GET(
    new Request(request, { headers: { authorization: 'Bearer synthetic-cron' } })
  );
  expect(withBearer.status).toBe(410);
  expect(await response.text()).toBe('');
  expect(mocks.authorizeCronRequest).not.toHaveBeenCalled();
  expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  expect(mocks.runEngagementCronCore).not.toHaveBeenCalled();
});
