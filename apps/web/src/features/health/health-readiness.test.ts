import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRlsRoleReadiness } from '../../../../../packages/database/src/rls-role-readiness';

const fixture = vi.hoisted(() => ({
  readiness: undefined as ReturnType<typeof createRlsRoleReadiness> | undefined,
  query: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  assertRlsConnectionRoleReady: () => fixture.readiness!.assertReady(),
  db: {
    get select() {
      fixture.readiness!.assertClientReady();
      return () => ({ from: () => ({ limit: fixture.query }) });
    },
  },
}));
vi.mock('@interdomestik/database/schema/auth', () => ({ user: { id: 'id' } }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
  fixture.query.mockReset().mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('health probes recover a settled posture timeout without any member request', async () => {
  const safe = [{ currentUser: 'tenant', roleBypassesRls: false, roleIsSuperuser: false }];
  let settle!: (value: typeof safe) => void;
  const queryRolePosture = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          settle = resolve;
        })
    )
    .mockResolvedValue(safe);
  fixture.readiness = createRlsRoleReadiness({
    enabled: true,
    initialFailure: null,
    queryRolePosture,
    report: vi.fn(),
  });
  const { performHealthCheck } = await import('./health.service');
  await vi.advanceTimersByTimeAsync(5_000);
  expect((await performHealthCheck()).status).toBe('unhealthy');
  expect(fixture.query).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30_000);
  const pendingResults = await Promise.all(Array.from({ length: 8 }, () => performHealthCheck()));
  expect(pendingResults.every(result => result.status === 'unhealthy')).toBe(true);
  expect(queryRolePosture).toHaveBeenCalledTimes(1);
  expect(fixture.query).not.toHaveBeenCalled();
  settle(safe);
  await vi.advanceTimersByTimeAsync(5_000);
  const results = await Promise.all(Array.from({ length: 8 }, () => performHealthCheck()));
  expect(results.every(result => result.status === 'healthy')).toBe(true);
  expect(queryRolePosture).toHaveBeenCalledTimes(2);
  expect(fixture.query).toHaveBeenCalledTimes(8);
  fixture.query.mockRejectedValueOnce(new Error('liveness failed'));
  expect((await performHealthCheck()).status).toBe('unhealthy');
  expect(queryRolePosture).toHaveBeenCalledTimes(2);
});

it('health never probes data when the database role bypasses RLS', async () => {
  fixture.readiness = createRlsRoleReadiness({
    enabled: true,
    initialFailure: null,
    queryRolePosture: async () => [
      { currentUser: 'unsafe', roleBypassesRls: true, roleIsSuperuser: false },
    ],
    report: vi.fn(),
  });
  const { performHealthCheck } = await import('./health.service');
  const result = await performHealthCheck();
  expect(result.status).toBe('unhealthy');
  expect(fixture.query).not.toHaveBeenCalled();
});

it('non-timeout posture errors remain unhealthy without retries or data access', async () => {
  const queryRolePosture = vi.fn().mockRejectedValue(new Error('permission denied'));
  fixture.readiness = createRlsRoleReadiness({
    enabled: true,
    initialFailure: null,
    queryRolePosture,
    report: vi.fn(),
  });
  const { performHealthCheck } = await import('./health.service');
  expect((await performHealthCheck()).status).toBe('unhealthy');
  await vi.advanceTimersByTimeAsync(60_000);
  expect((await performHealthCheck()).status).toBe('unhealthy');
  expect(queryRolePosture).toHaveBeenCalledTimes(1);
  expect(fixture.query).not.toHaveBeenCalled();
});
