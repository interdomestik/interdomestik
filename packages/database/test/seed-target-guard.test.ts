import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { beforeEach } from 'node:test';
import { DEFAULT_E2E_PASSWORD } from '../src/e2e-users';
import { assertSeedTargetAllowed, resetSeedTargetBindingForTests } from '../src/seed-target-guard';
beforeEach(resetSeedTargetBindingForTests);

const production = 'gunosplgrvnvrftudttr';
const staging = 'xjyseqtfuxcuviiankhy';
const strongOverride = ['x'.repeat(18), 'A', '1'].join('');
const local = 'postgresql://fixture:credential-CANARY@127.0.0.1:54322/postgres';
const direct = (ref: string) => `postgresql://fixture:credential-CANARY@db.${ref}.supabase.co/db`;
const pooled = (ref: string) =>
  `postgresql://postgres.${ref}:credential-CANARY@aws-0-eu.pooler.supabase.com:6543/db`;
test('loopback needs no confirmation; missing/malformed/non-postgres targets fail closed', () => {
  for (const host of ['localhost', '127.0.0.1', '127.0.0.1:55438']) {
    resetSeedTargetBindingForTests();
    assert.equal(
      assertSeedTargetAllowed({ DATABASE_URL: `postgres://fixture@${host}/db` }),
      'local'
    );
  }
  // postgres 3.4.9 splits hosts on ':', so bracketed IPv6 never reaches the parsed host.
  assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL: 'postgres://fixture@[::1]/db' }));
  for (const DATABASE_URL of [undefined, '', 'CANARY', 'https://localhost/db']) {
    assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL }), /refused: invalid$/);
  }
});

test('production cannot be enabled by reset flags, staging tokens or local markers', () => {
  const productionTargets = [
    direct(production),
    pooled(production),
    pooled(production).replace('postgres.', 'postgres%2E'),
    direct(production).replace('db.gunos', 'db.%67unos'),
    `postgresql://postgres.${production}%@127.0.0.1/db`,
  ];
  for (const DATABASE_URL of productionTargets) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL,
          NODE_ENV: 'test',
          SEED_ALLOW_RESET: 'true',
          SEED_TARGET_CONFIRM: `plan070:${production}`,
        }),
      /refused: production$/
    );
  }
  for (const marker of ['NODE_ENV', 'VERCEL_ENV']) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL: local, [marker]: 'production' }),
      /production$/
    );
  }
  for (const marker of ['SUPABASE_PROJECT_REF', 'SUPABASE_REF', 'SUPABASE_PROJECT_ID']) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL: local, [marker]: production }),
      /production$/
    );
  }
  for (const marker of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL: local,
          [marker]: `https://${production}.supabase.co`,
        }),
      /production$/
    );
  }
});

test('non-local requires an exact target-bound token, including container DNS', () => {
  for (const DATABASE_URL of [direct(staging), pooled(staging)]) {
    resetSeedTargetBindingForTests();
    assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL }), /non-local-unconfirmed$/);
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL, SEED_TARGET_CONFIRM: 'true' }),
      /non-local-unconfirmed$/
    );
    assert.equal(
      assertSeedTargetAllowed(
        { DATABASE_URL, SEED_TARGET_CONFIRM: `plan070:${staging}`, E2E_PASSWORD: strongOverride },
        strongOverride
      ),
      'confirmed-non-local'
    );
  }
  resetSeedTargetBindingForTests();
  const DATABASE_URL = 'postgres://fixture@ci-postgres/test';
  assert.throws(() => assertSeedTargetAllowed({ DATABASE_URL }), /non-local-unconfirmed$/);
  assert.equal(
    assertSeedTargetAllowed({
      DATABASE_URL,
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
      E2E_PASSWORD: DEFAULT_E2E_PASSWORD,
    }),
    'confirmed-ci'
  );
  assert.throws(
    () =>
      assertSeedTargetAllowed({
        DATABASE_URL: direct('abcdefghijklmnopqrst'),
        SEED_TARGET_CONFIRM: `plan070:${staging}`,
      }),
    /non-local-unconfirmed$/
  );
});

test('errors disclose only classification, never target or credentials', () => {
  for (const DATABASE_URL of [direct(production), pooled(staging), 'credential-CANARY']) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(
          error.message,
          /^Seed target refused: (production|non-local-unconfirmed|invalid)$/
        );
        assert.ok(!error.message.includes('CANARY'));
        return true;
      }
    );
  }
});

test('container seed callers pass fixed confirmations rather than deriving approval from the DB URL', () => {
  const read = (file: string) =>
    readFileSync(new URL(`../../../scripts/${file}`, import.meta.url), 'utf8');
  assert.match(
    read('docker-run.sh'),
    /-e "SEED_TARGET_CONFIRM=\$\{SEED_TARGET_CONFIRM:-plan070:host\.docker\.internal\}"/
  );
  for (const file of ['docker-gate.sh', 'safe-gate.sh']) {
    const source = read(file);
    assert.equal(source.split('plan070:host.docker.internal').length - 1, 2);
    assert.match(source, /seed:e2e/);
    assert.match(source, /seed:assert-e2e/);
  }
  assert.match(read('ci-local-parity.sh'), /d SEED_TARGET_CONFIRM plan070:ci-postgres/);
  const m4 = read('m4-gatekeeper.sh');
  assert.ok(m4.indexOf('--check-target') < m4.indexOf('pnpm seed:e2e'));
});

test('every query and PG source refuses production even when URL identity is staging', () => {
  const keys = [
    'user',
    'username',
    'host',
    'hostname',
    'hostaddr',
    'options',
    'database',
    'application_name',
    'sslmode',
    'unknown',
  ];
  for (const key of keys) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL: `${pooled(staging)}?${key}=${encodeURIComponent('postgres.' + production)}`,
          SEED_TARGET_CONFIRM: `plan070:${staging}`,
        }),
      /production$/
    );
  }
  const driverEnvironmentKeys = `PGHOST PGHOSTADDR PGUSER PGUSERNAME PGDATABASE PGPORT
    PGPASSWORD PGAPPNAME PGOPTIONS PGTARGETSESSIONATTRS PGMAX PGSSL PGSSLNEGOTIATION
    PGIDLE_TIMEOUT PGCONNECT_TIMEOUT PGMAX_LIFETIME PGMAX_PIPELINE PGBACKOFF PGKEEP_ALIVE
    PGPREPARE PGDEBUG PGFETCH_TYPES PGPUBLICATIONS PGTARGET_SESSION_ATTRS USERNAME USER LOGNAME`;
  for (const key of driverEnvironmentKeys.split(/\s+/)) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL: local,
          [key]: production,
        }),
      /production$/
    );
  }
});

test('conflicting sources and opaque startup overrides refuse instead of trusting a token', () => {
  const other = 'abcdefghijklmnopqrst';
  assert.throws(
    () =>
      assertSeedTargetAllowed({
        DATABASE_URL: pooled(staging).replace('aws-0-eu.pooler.supabase.com', 'other.example.com'),
        SEED_TARGET_CONFIRM: `plan070:${staging}`,
      }),
    /ambiguous$/
  );
  for (const query of [
    `user=postgres.${other}`,
    `username=postgres.${other}`,
    'host=localhost',
    'hostname=localhost',
    'hostaddr=127.0.0.1',
    'options=-c%20role%3Dpostgres',
    'database=other',
    'unknown=anything',
    `user=postgres.${staging}&user=postgres.${other}`,
  ]) {
    assert.throws(
      () =>
        assertSeedTargetAllowed({
          DATABASE_URL: `${pooled(staging)}?${query}`,
          SEED_TARGET_CONFIRM: `plan070:${staging}`,
        }),
      /ambiguous$/
    );
  }
  for (const key of [
    'PGHOST',
    'PGHOSTADDR',
    'PGUSER',
    'PGUSERNAME',
    'PGOPTIONS',
    'PGSERVICE',
    'PGSERVICEFILE',
  ]) {
    assert.throws(
      () => assertSeedTargetAllowed({ DATABASE_URL: local, [key]: 'different' }),
      /ambiguous$/
    );
  }
  assert.throws(
    () =>
      assertSeedTargetAllowed({
        DATABASE_URL: direct(staging),
        DATABASE_URL_RLS: direct(other),
        SEED_TARGET_CONFIRM: `plan070:${staging}`,
      }),
    /ambiguous$/
  );
  assert.throws(
    () => assertSeedTargetAllowed({ DATABASE_URL: local, DATABASE_URL_RLS: direct(production) }),
    /production$/
  );
});

test('matching identity sources and explicit driver fallbacks resolve to one confirmed target', () => {
  assert.equal(
    assertSeedTargetAllowed(
      {
        DATABASE_URL: `${pooled(staging)}?user=postgres.${staging}&sslmode=require`,
        PGUSER: `postgres.${staging}`,
        PGHOST: 'aws-0-eu.pooler.supabase.com',
        SEED_TARGET_CONFIRM: `plan070:${staging}`,
        E2E_PASSWORD: strongOverride,
      },
      strongOverride
    ),
    'confirmed-non-local'
  );
  for (const key of ['PGUSER', 'PGUSERNAME']) {
    resetSeedTargetBindingForTests();
    assert.equal(
      assertSeedTargetAllowed(
        {
          DATABASE_URL: 'postgres://aws-0-eu.pooler.supabase.com/db',
          [key]: `postgres.${staging}`,
          SEED_TARGET_CONFIRM: `plan070:${staging}`,
          E2E_PASSWORD: strongOverride,
        },
        strongOverride
      ),
      'confirmed-non-local'
    );
  }
  assert.throws(
    () => assertSeedTargetAllowed({ DATABASE_URL: 'postgres://localhost/db' }),
    /invalid$/
  );
});
