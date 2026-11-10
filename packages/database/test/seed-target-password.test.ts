import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_E2E_PASSWORD } from '../src/e2e-users';
import { assertSeedTargetAllowed } from '../src/seed-target-guard';

const staging = 's'.repeat(20);
const pooler = 'aws-0-eu.pooler.supabase.com';
type TargetEnvironment = Readonly<Record<string, string | undefined>>;
const remoteTargets: readonly TargetEnvironment[] = [
  [`fixture@db.${staging}.supabase.co`, staging],
  [`fixture@${staging}.supabase.co`, staging],
  [`postgres.${staging}@${pooler}`, staging],
  [`fixture@${pooler}`, pooler],
  ['fixture@db.example.net', 'db.example.net'],
  ['fixture@other-postgres', 'other-postgres'],
  ['fixture@host.docker.internal', 'host.docker.internal'],
  ['fixture@ci-postgres.example.net', 'ci-postgres.example.net'],
  ['fixture@ci-postgres.', 'ci-postgres.'],
  [`fixture@${staging}`, staging],
].map(([authority, target]) => ({
  DATABASE_URL: `postgres://${authority}/db`,
  SEED_TARGET_CONFIRM: `plan070:${target}`,
}));
const strongOverride = ['x'.repeat(18), 'A', '1'].join('');

function assertRemoteRefused(
  target: TargetEnvironment,
  override: string | undefined,
  effectivePassword: string = override?.trim() || DEFAULT_E2E_PASSWORD
): void {
  assert.throws(
    () => assertSeedTargetAllowed({ ...target, E2E_PASSWORD: override }, effectivePassword),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, 'Seed target refused: non-local-password');
      for (const value of [override, effectivePassword]) {
        if (value?.trim()) {
          assert.ok(!error.message.includes(value.trim()));
          assert.ok(!error.message.includes(String(value.length)));
          assert.ok(!error.message.includes(String(value.trim().length)));
        }
      }
      return true;
    }
  );
}

const refusedOverrides: ReadonlyArray<readonly [string, string | undefined]> = [
  ['unset override', undefined],
  ['empty override', ''],
  ['whitespace override', ' '.repeat(20)],
  ['public default', DEFAULT_E2E_PASSWORD],
  ['padded public default', ` ${DEFAULT_E2E_PASSWORD} `],
  ['short three-class override', ['x'.repeat(17), 'A', '1'].join('')],
  ['padding below minimum', ` ${['x'.repeat(17), 'A', '1'].join('')} `],
  ['one-class override', 'x'.repeat(32)],
  ['two-class override', ['x'.repeat(31), 'A'].join('')],
  ['whitespace as a third class', ['x'.repeat(18), ' ', 'A'].join('')],
];

for (const [label, override] of refusedOverrides) {
  test(`remote refuses ${label} without disclosing value or length`, () => {
    for (const target of remoteTargets) {
      assertRemoteRefused(target, override);
    }
  });
}

test('remote admits trimmed overrides with at least twenty characters and three classes', () => {
  const admittedOverrides = [
    strongOverride,
    ` ${strongOverride} `,
    ['x'.repeat(18), 'A', '!'].join(''),
    ['x'.repeat(18), '1', '!'].join(''),
    ['X'.repeat(18), '1', '!'].join(''),
  ];
  for (const E2E_PASSWORD of admittedOverrides) {
    for (const target of remoteTargets) {
      assert.equal(
        assertSeedTargetAllowed({ ...target, E2E_PASSWORD }, E2E_PASSWORD.trim()),
        'confirmed-non-local'
      );
    }
  }
});

test('remote refuses cached fallback, weak values and environment drift', () => {
  const cachedValues = [DEFAULT_E2E_PASSWORD, 'x'.repeat(32), strongOverride + '!'];
  for (const target of remoteTargets) {
    for (const cached of cachedValues) {
      assertRemoteRefused(target, strongOverride, cached);
    }
    assertRemoteRefused(target, undefined, strongOverride);
    assertRemoteRefused(target, ' '.repeat(20), strongOverride);
  }
});

test('only loopback and confirmed ci-postgres retain default, missing and weak overrides', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'ci-postgres']) {
    const expected = host === 'ci-postgres' ? 'confirmed-non-local' : 'local';
    for (const E2E_PASSWORD of [DEFAULT_E2E_PASSWORD, undefined, 'x'.repeat(1)]) {
      assert.equal(
        assertSeedTargetAllowed(
          {
            DATABASE_URL: `postgres://fixture@${host}/db`,
            SEED_TARGET_CONFIRM: `plan070:${host}`,
            E2E_PASSWORD,
          },
          strongOverride
        ),
        expected
      );
    }
  }
});

test('ci-postgres exemption requires its exact confirmation and cannot be borrowed', () => {
  assert.equal(
    assertSeedTargetAllowed({
      DATABASE_URL: 'postgres://fixture@ci-postgres/db',
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
    }),
    'confirmed-non-local'
  );
  assert.throws(
    () =>
      assertSeedTargetAllowed({
        DATABASE_URL: 'postgres://fixture@other-postgres/db',
        SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
      }),
    /refused: non-local-unconfirmed$/
  );
});

test('authorities the postgres driver resolves differently never borrow an exemption', () => {
  // postgres 3.4.9 connects to the host after the first '@'; WHATWG URL reads the last one.
  const mismatched = [
    ['fixture@remote.example.net,ignored@ci-postgres', 'ci-postgres'],
    ['fixture@remote.example.net,ignored@localhost', 'localhost'],
    ['fixture@remote.example.net@ci-postgres', 'ci-postgres'],
    ['fixture@ci-postgres,remote.example.net', 'ci-postgres'],
    ['fixture@127.0.0.1,remote.example.net', '127.0.0.1'],
    ['fixture@remote%2Eexample.net', 'remote.example.net'],
    ['fixture@remote.example.net#@ci-postgres', 'ci-postgres'],
  ];
  for (const [authority, target] of mismatched) {
    for (const key of ['DATABASE_URL', 'DATABASE_URL_RLS']) {
      const env = {
        DATABASE_URL: 'postgres://fixture@ci-postgres/db',
        SEED_TARGET_CONFIRM: `plan070:${target}`,
        E2E_PASSWORD: strongOverride,
        [key]: `postgres://${authority}/db`,
      };
      assert.throws(() => assertSeedTargetAllowed(env, strongOverride), /refused: ambiguous$/);
    }
  }
});
