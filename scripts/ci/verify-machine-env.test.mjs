import assert from 'node:assert/strict';
import test from 'node:test';

import { environmentErrors, redirectingEnvNames } from './verify-machine-env.mjs';
import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';

function errorsFor(env, sources = {}) {
  return environmentErrors(fixtureMarker(), { ...fixtureLive().env, ...env }, sources);
}
const URL_FORM = 'must be postgresql://[user[:password]@]host:port/database and nothing else';

test('the checked environment of the fixture passes', () => {
  assert.deepEqual(errorsFor({}), []);
});

test('the shared database port and the default fallback are refused', () => {
  const shared = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  assert.deepEqual(errorsFor({ E2E_DATABASE_URL: shared }), [
    'E2E_DATABASE_URL uses forbidden port 54322',
    'E2E_DATABASE_URL port is not 55438',
    'E2E_DATABASE_URL database is not interdomestik_test',
  ]);
  assert.deepEqual(errorsFor({ DATABASE_URL: '' }), [
    'DATABASE_URL must be set; the default fallback is the shared database on 54322',
  ]);
  assert.deepEqual(errorsFor({ DATABASE_URL_RLS: 'nope' }), [`DATABASE_URL_RLS ${URL_FORM}`]);
  const remote = 'postgresql://u:p@db.example.test:55438/interdomestik_test';
  assert.deepEqual(errorsFor({ DATABASE_URL: remote }), ['DATABASE_URL host is not 127.0.0.1']);
  // Without a port the driver would take PGPORT or its default instead of the marker's port.
  const portless = 'postgresql://u:p@127.0.0.1/interdomestik_test';
  assert.deepEqual(errorsFor({ DATABASE_URL: portless }), [`DATABASE_URL ${URL_FORM}`]);
});

test('a database URL drivers could read differently from the check is refused', () => {
  const base = 'postgresql://u:p@127.0.0.1:55438/interdomestik_test';
  const ambiguous = [
    // Options and fragments, empty ones included, which drivers apply over the checked parts.
    `${base}?database=postgres`,
    `${base}?port=54322`,
    `${base}?`,
    `${base}#`,
    `${base}#x`,
    // Several `@` (one driver reads localhost:54322), several hosts, encoded or extra text.
    'postgresql://u:p@localhost:54322@127.0.0.1:55438/interdomestik_test',
    'postgresql://u:p@127.0.0.1:55438,localhost:54322/interdomestik_test',
    'postgresql://u:p@%31%32%37.0.0.1:55438/interdomestik_test',
    `${base}\\extra`,
    `${base}\t`,
    'postgresql://u:p@127.0.0.1:55438/interdomestik_test/extra',
    'postgresql://u:p@127.0.0.1:0x1d5e/interdomestik_test',
    // A stray `%`, an undecodable escape, a comma or other reserved character in the user
    // information, an upper-case scheme and an IPv6 literal: drivers disagree on each.
    'postgresql://u:50%@127.0.0.1:55438/interdomestik_test',
    'postgresql://u:%C3@127.0.0.1:55438/interdomestik_test',
    'postgresql://u:p%00ss@127.0.0.1:55438/interdomestik_test',
    'postgresql://u:p%0Ass@127.0.0.1:55438/interdomestik_test',
    'postgresql://u%7F:p@127.0.0.1:55438/interdomestik_test',
    'postgresql://u,v:p@127.0.0.1:55438/interdomestik_test',
    'postgresql://u:p;x@127.0.0.1:55438/interdomestik_test',
    'PostgreSQL://u:p@127.0.0.1:55438/interdomestik_test',
    'postgresql://u:p@[::1]:55438/interdomestik_test',
    'postgresql://u:p@LOCALHOST:55438/interdomestik_test',
  ];
  for (const raw of ambiguous) {
    assert.deepEqual(errorsFor({ DATABASE_URL: raw }), [`DATABASE_URL ${URL_FORM}`], raw);
  }
  assert.deepEqual(
    errorsFor({ DATABASE_URL: 'postgres://127.0.0.1:55438/interdomestik_test' }),
    []
  );
  // A percent-encoded password that decodes cleanly is fine.
  assert.deepEqual(
    errorsFor({ DATABASE_URL: 'postgresql://u:p%40ss@127.0.0.1:55438/interdomestik_test' }),
    []
  );
});

test('the app port and every Playwright origin must use the recorded port on loopback', () => {
  assert.deepEqual(errorsFor({ PW_PORT: '3000' }), ['PW_PORT uses forbidden port 3000']);
  assert.deepEqual(errorsFor({ PW_PORT: '' }), ['PW_PORT must be set to 3310']);
  assert.deepEqual(errorsFor({ PW_PORT: '3311' }), ['PW_PORT is not 3310']);
  assert.deepEqual(errorsFor({ PORT: '3000' }), ['PORT uses forbidden port 3000']);
  assert.deepEqual(errorsFor({ PILOT_HOST: 'pilot.x:3000' }), [
    'PILOT_HOST does not use port 3310',
    'PILOT_HOST is not a loopback host',
  ]);
  assert.deepEqual(errorsFor({ KS_HOST: 'ks.127.0.0.1.nip.io:3000' }), [
    'KS_HOST does not use port 3310',
  ]);
  assert.deepEqual(errorsFor({ MK_HOST: 'mk.127.0.0.1.nip.io:13310' }), [
    'MK_HOST does not use port 3310',
  ]);
  assert.deepEqual(errorsFor({ IDA_HOST: 'ida.example.test:3310' }), [
    'IDA_HOST is not a loopback host',
  ]);
  assert.deepEqual(errorsFor({ PLAYWRIGHT_BASE_URL: 'http://localhost:3000' }), [
    'PLAYWRIGHT_BASE_URL does not use port 3310',
  ]);
  assert.deepEqual(
    errorsFor({
      AL_HOST: 'al.127.0.0.1.nip.io:3310',
      PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3310',
    }),
    []
  );
});

test('ports and hosts must have the exact form Playwright reads', () => {
  // Playwright builds `http://<tenant host>/<locale>`; a scheme there becomes host `http`.
  assert.deepEqual(errorsFor({ KS_HOST: 'http://127.0.0.1:3310' }), [
    'KS_HOST must be a bare host:port',
  ]);
  assert.deepEqual(errorsFor({ AL_HOST: 'al.localhost:3310/x' }), [
    'AL_HOST must be a bare host:port',
  ]);
  assert.deepEqual(errorsFor({ PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:3310/x' }), [
    'PLAYWRIGHT_BASE_URL must be http://host:port',
  ]);
  // Playwright accepts only decimal digits for the port.
  for (const port of ['3.31e3', '0x0cee', ' 3310', '3310 ']) {
    assert.deepEqual(errorsFor({ PW_PORT: port }), ['PW_PORT must be a decimal port'], port);
  }
  assert.deepEqual(errorsFor({ PORT: '3310.0' }), ['PORT must be a decimal port']);
});

test('a set-but-empty key fails the gate, because the E2E lane would fall back to 54322', () => {
  assert.deepEqual(errorsFor({ E2E_DATABASE_URL: '', KS_HOST: '' }), [
    "E2E_DATABASE_URL is set but empty; unset it or give it the marker's value",
    "KS_HOST is set but empty; unset it or give it the marker's value",
  ]);
  assert.deepEqual(errorsFor({ SENTRY_AUTH_TOKEN: '' }), []);
});

test('a Sentry upload token fails the gate', () => {
  assert.deepEqual(errorsFor({ SENTRY_AUTH_TOKEN: 'set' }), [
    'SENTRY_AUTH_TOKEN must be unset for gate evidence',
  ]);
});

test('local env files and libpq or dotenv variables fail the gate; values stay unprinted', () => {
  const sources = {
    localFiles: ['.env.local', 'packages/database/.env'],
    unsearched: ['tmp/locked'],
    redirecting: ['PGPORT'],
  };
  assert.deepEqual(errorsFor({}, sources), [
    '.env.local exists; gate runs take settings only from the checked environment',
    'packages/database/.env exists; gate runs take settings only from the checked environment',
    'tmp/locked could not be searched for env files',
    'PGPORT is set; it can redirect the run (libpq, dotenv, shell startup or git)',
  ]);
});

test('only variables that can redirect a run are reported, by name', () => {
  const env = {
    PGPORT: '1',
    DOTENV_CONFIG_PATH: 'p',
    BASH_ENV: '/x',
    ENV: '/y',
    GIT_WORK_TREE: '/other',
    GIT_CONFIG_COUNT: '1',
    // Any other git variable counts, including ones added in later git versions.
    GIT_LITERAL_PATHSPECS: '1',
    GIT_EXEC_PATH: '/other',
    GIT_EDITOR: 'vim',
    GIT_PAGER: 'less',
    GIT_AUTHOR_NAME: 'n',
    ENVIRONMENT: 'dev',
    PATH: '/bin',
    NOT_PG: '1',
  };
  assert.deepEqual(redirectingEnvNames(env), [
    'BASH_ENV',
    'DOTENV_CONFIG_PATH',
    'ENV',
    'GIT_CONFIG_COUNT',
    'GIT_EXEC_PATH',
    'GIT_LITERAL_PATHSPECS',
    'GIT_WORK_TREE',
    'PGPORT',
  ]);
});

test('every variable that names a database URL is checked, not only the four listed', () => {
  const shared = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  assert.deepEqual(errorsFor({ E2E_SERVER_DATABASE_URL_RLS: shared }), [
    'E2E_SERVER_DATABASE_URL_RLS uses forbidden port 54322',
    'E2E_SERVER_DATABASE_URL_RLS port is not 55438',
    'E2E_SERVER_DATABASE_URL_RLS database is not interdomestik_test',
  ]);
  assert.deepEqual(errorsFor({ E2E_DATABASE_URL_ADMIN: '' }), [
    "E2E_DATABASE_URL_ADMIN is set but empty; unset it or give it the marker's value",
  ]);
});
