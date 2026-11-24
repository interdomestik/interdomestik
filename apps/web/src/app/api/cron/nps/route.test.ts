import { expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  runNpsCronCore: vi.fn(),
}));

vi.mock('../_auth', () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('./_core', () => ({ runNpsCronCore: mocks.runNpsCronCore }));

it('returns 410 without running the nps job', async () => {
  const request = new Request('http://localhost/api/cron/nps');
  const response = GET(request);
  expect(response.status).toBe(410);

  const withBearer = GET(
    new Request(request, { headers: { authorization: 'Bearer synthetic-cron' } })
  );
  expect(withBearer.status).toBe(410);
  expect(await response.text()).toBe('');
  expect(mocks.authorizeCronRequest).not.toHaveBeenCalled();
  expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  expect(mocks.runNpsCronCore).not.toHaveBeenCalled();
});
