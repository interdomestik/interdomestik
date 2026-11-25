import { expect, it, vi } from 'vitest';
import { expectClosedCronRoute } from '../closed-route.test-support';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(),
  enforceRateLimit: vi.fn(),
  runDunningCronCore: vi.fn(),
}));

vi.mock('../_auth', () => ({ authorizeCronRequest: mocks.authorizeCronRequest }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock('./_core', () => ({ runDunningCronCore: mocks.runDunningCronCore }));

it('returns 410 without running the dunning job', async () => {
  await expectClosedCronRoute(GET, 'http://localhost/api/cron/dunning');
  expect(mocks.authorizeCronRequest).not.toHaveBeenCalled();
  expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  expect(mocks.runDunningCronCore).not.toHaveBeenCalled();
});
