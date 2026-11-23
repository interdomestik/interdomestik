import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { fixtureQuery, applicationQuery } = vi.hoisted(() => ({
  fixtureQuery: vi.fn<(statement: TemplateStringsArray) => unknown>(),
  applicationQuery: vi.fn(),
}));

vi.mock('postgres', () => ({ default: () => fixtureQuery }));
vi.mock('@interdomestik/database/db', () => ({ dbAdmin: { $client: applicationQuery } }));
vi.mock('./different-email-recovery-store', () => ({}));

const applicationUrl = 'postgresql://owner@127.0.0.1:54322/recovery_test';
const remoteUrl = 'postgresql://owner@db.example.invalid:5432/recovery_test';
const refusal = 'Pilot contract requires matching isolated local database targets';

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv('DATABASE_URL', applicationUrl);
  vi.stubEnv('DATABASE_URL_RLS', 'postgresql://runtime@127.0.0.1:54322/recovery_test');
});

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['a mismatched loopback override', 'postgresql://owner@127.0.0.1:54322/another_test'],
  ['a remote override', remoteUrl],
  ['matching remote targets', remoteUrl, remoteUrl],
])('refuses %s before any fixture query', async (_target, override, appTarget?: string) => {
  if (appTarget) {
    vi.stubEnv('DATABASE_URL', appTarget);
    vi.stubEnv('DATABASE_URL_RLS', appTarget);
  }
  vi.stubEnv('DIFFERENT_EMAIL_RECOVERY_DATABASE_URL', override);
  const { createRecoveryOwner, openRecoveryContractIntake } =
    await import('./different-email-recovery-store.contract-test-support');

  await expect(createRecoveryOwner('wrong-target')).rejects.toThrow(refusal);
  await expect(openRecoveryContractIntake()).rejects.toThrow(refusal);
  expect(fixtureQuery).not.toHaveBeenCalled();
  expect(applicationQuery).not.toHaveBeenCalled();
});

it('refuses a different live database after only read-only identity probes', async () => {
  vi.stubEnv('DIFFERENT_EMAIL_RECOVERY_DATABASE_URL', applicationUrl);
  fixtureQuery.mockResolvedValue([{ database: 'another_test', started: '1', pid: 10 }]);
  applicationQuery.mockResolvedValue([{ database: 'recovery_test', started: '1', pid: 11 }]);
  const { openRecoveryContractIntake } =
    await import('./different-email-recovery-store.contract-test-support');

  await expect(openRecoveryContractIntake()).rejects.toThrow(refusal);
  expect(fixtureQuery).toHaveBeenCalledTimes(1);
  expect(fixtureQuery.mock.calls[0][0][0]).toMatch(/^\s*select current_database\(\)/u);
  expect(applicationQuery).toHaveBeenCalledTimes(1);
});
