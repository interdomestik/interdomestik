import { expect, it, vi } from 'vitest';
import { expectClosedCronRoute } from '../closed-route.test-support';
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
  await expectClosedCronRoute(GET, 'http://localhost/api/cron/engagement');
  expect(mocks.authorizeCronRequest).not.toHaveBeenCalled();
  expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
  expect(mocks.runEngagementCronCore).not.toHaveBeenCalled();
});
