import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { readDisposableTargetClass } from '../src/seed-target-classification';
import {
  assertDisposableTarget,
  assertSeedTargetAllowed,
  resetSeedTargetBindingForTests,
} from '../src/seed-target-guard';
beforeEach(resetSeedTargetBindingForTests);

// R-13 / CHK-13 (a): only loopback and the confirmed CI container are disposable targets.
const production = 'gunosplgrvnvrftudttr';
const staging = 'xjyseqtfuxcuviiankhy';
// A well-formed project reference the guard has never seen: what a new production project is.
const unseen = 'qwertyuiopasdfghjklz';
const strong = ['Strong', 'Fixture', '-', 'Pass', '42', 'x'.repeat(8)].join('');
const remoteEnv = (DATABASE_URL: string, target: string) => ({
  DATABASE_URL,
  SEED_TARGET_CONFIRM: `plan070:${target}`,
  E2E_PASSWORD: strong,
});
const direct = (ref: string) => `postgresql://fixture:credential-CANARY@db.${ref}.supabase.co/db`;
const pooled = (ref: string) =>
  `postgresql://postgres.${ref}:credential-CANARY@aws-0-eu-central-1.pooler.supabase.com:6543/db`;
const refusal = /^Error: Seed target refused: non-disposable$/;

test('runtime classification is pure and still requires two explicit disposable URLs', () => {
  const env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://fixture@127.0.0.1/db',
    DATABASE_URL_RLS: 'postgres://runtime@127.0.0.1/db',
  };
  assert.equal(readDisposableTargetClass(env), 'local');
  assert.throws(() => assertDisposableTarget(env), /refused: production$/);
  assert.equal(readDisposableTargetClass({ ...env, DATABASE_URL_RLS: undefined }), null);
  assert.equal(readDisposableTargetClass({ ...env, DATABASE_URL_RLS: direct(staging) }), null);
  assert.equal(readDisposableTargetClass({ ...env, VERCEL_ENV: 'production' }), null);
  assert.equal(readDisposableTargetClass({ ...env, PGHOST: 'outside.invalid' }), null);
});

test('accepts loopback without confirmation', () => {
  for (const host of ['localhost', '127.0.0.1', '127.0.0.1:55438', 'LOCALHOST:5432']) {
    assert.equal(
      assertDisposableTarget({ DATABASE_URL: `postgres://fixture@${host}/db` }),
      'local'
    );
  }
});

test('accepts the CI container only with its exact confirmation', () => {
  const DATABASE_URL = 'postgresql://postgres:postgres@ci-postgres:5432/interdomestik_test';
  assert.equal(
    assertDisposableTarget({ DATABASE_URL, SEED_TARGET_CONFIRM: 'plan070:ci-postgres' }),
    'confirmed-ci'
  );
  assert.throws(() => assertDisposableTarget({ DATABASE_URL }), /non-local-unconfirmed$/);
  assert.throws(
    () => assertDisposableTarget({ DATABASE_URL, SEED_TARGET_CONFIRM: 'plan070:other' }),
    /non-local-unconfirmed$/
  );
});

test('refuses an arbitrary remote host with a valid confirmation and a strong password', () => {
  const env = remoteEnv(
    'postgresql://fixture:credential-CANARY@db.example.net:5432/app',
    'db.example.net'
  );
  // The seed guard admits this target; the disposable assertion must not.
  assert.equal(assertSeedTargetAllowed(env, strong), 'confirmed-non-local');
  resetSeedTargetBindingForTests();
  assert.throws(() => assertDisposableTarget(env), refusal);
});

test('refuses the staging project, directly and through its pooler', () => {
  assert.throws(() => assertDisposableTarget(remoteEnv(direct(staging), staging)), refusal);
  assert.throws(() => assertDisposableTarget(remoteEnv(pooled(staging), staging)), refusal);
});

test('refuses a project reference the guard has never seen', () => {
  assert.throws(() => assertDisposableTarget(remoteEnv(direct(unseen), unseen)), refusal);
});

test('refuses a pooler host, with or without a project user', () => {
  assert.throws(() => assertDisposableTarget(remoteEnv(pooled(unseen), unseen)), refusal);
  const host = 'aws-0-eu-central-1.pooler.supabase.com';
  const bare = `postgresql://fixture:credential-CANARY@${host}:6543/db`;
  assert.throws(() => assertDisposableTarget(remoteEnv(bare, host)), refusal);
});

test('refuses production and missing, malformed or non-postgres targets', () => {
  assert.throws(
    () => assertDisposableTarget(remoteEnv(direct(production), production)),
    /refused: production$/
  );
  for (const DATABASE_URL of [undefined, '', 'CANARY', 'https://localhost/db']) {
    assert.throws(() => assertDisposableTarget({ DATABASE_URL }), /refused: invalid$/);
  }
  assert.throws(
    () =>
      assertDisposableTarget({
        DATABASE_URL: 'postgres://fixture@127.0.0.1/db',
        DATABASE_URL_RLS: '',
      }),
    /refused: invalid$/
  );
});

test('refuses a loopback URL whose credentials or database the driver cannot decode', () => {
  for (const DATABASE_URL of [
    'postgres://fixture%ZZ@127.0.0.1/db',
    'postgres://fixture:%E0%A4%A@127.0.0.1/db',
    'postgres://fixture@127.0.0.1/d%ZZb',
    'postgres://fixture%00@127.0.0.1/db',
  ]) {
    assert.throws(
      () => assertDisposableTarget({ DATABASE_URL }),
      /refused: invalid$/,
      DATABASE_URL
    );
  }
  assert.throws(
    () =>
      assertDisposableTarget({
        DATABASE_URL: 'postgres://fixture@127.0.0.1/db',
        DATABASE_URL_RLS: 'postgres://fixture%ZZ@127.0.0.1/db',
      }),
    /refused: invalid$/
  );
});

test('refuses when the RLS URL points somewhere else than a loopback admin URL', () => {
  assert.throws(
    () =>
      assertDisposableTarget({
        DATABASE_URL: 'postgres://fixture@127.0.0.1/db',
        DATABASE_URL_RLS: direct(unseen),
        SEED_TARGET_CONFIRM: `plan070:${unseen}`,
      }),
    /refused: ambiguous$/
  );
});

test('binds nothing, so neither an acceptance nor a refusal changes later seed preflights', () => {
  assert.throws(() => assertDisposableTarget(remoteEnv(direct(unseen), unseen)), refusal);
  assert.equal(
    assertDisposableTarget({ DATABASE_URL: 'postgres://fixture@127.0.0.1:1/a' }),
    'local'
  );
  assert.equal(
    assertSeedTargetAllowed({ DATABASE_URL: 'postgres://fixture@localhost:2/b' }),
    'local'
  );
});

test('errors disclose only the classification, never the target or credentials', () => {
  for (const env of [remoteEnv(direct(unseen), unseen), remoteEnv(pooled(staging), staging)]) {
    assert.throws(
      () => assertDisposableTarget(env),
      (error: unknown) => {
        const message = String(error);
        assert.match(message, refusal);
        for (const secret of ['CANARY', unseen, staging, strong]) {
          assert.equal(message.includes(secret), false, secret);
        }
        return true;
      }
    );
  }
});
