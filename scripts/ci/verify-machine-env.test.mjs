import assert from 'node:assert/strict';
import test from 'node:test';

import { environmentErrors, localEnvFiles, redirectingEnvNames } from './verify-machine-env.mjs';
import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';

function errorsFor(env, sources = {}) {
  return environmentErrors(fixtureMarker(), { ...fixtureLive().env, ...env }, sources);
}

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
  assert.deepEqual(errorsFor({ DATABASE_URL_RLS: 'nope' }), ['DATABASE_URL_RLS is not a URL']);
  const remote = 'postgresql://u:p@db.example.test:55438/interdomestik_test';
  assert.deepEqual(errorsFor({ DATABASE_URL: remote }), ['DATABASE_URL host is not 127.0.0.1']);
  // Without a port the driver would take PGPORT or its default instead of the marker's port.
  const portless = 'postgresql://u:p@127.0.0.1/interdomestik_test';
  assert.deepEqual(errorsFor({ DATABASE_URL: portless }), ['DATABASE_URL must name its port']);
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
  const sources = { localFiles: ['.env.local', 'packages/database/.env'], redirecting: ['PGPORT'] };
  assert.deepEqual(errorsFor({}, sources), [
    '.env.local exists; gate runs take settings only from the checked environment',
    'packages/database/.env exists; gate runs take settings only from the checked environment',
    'PGPORT is set; libpq and dotenv settings can redirect the run',
  ]);
});

test('every env file outside git is found, and only libpq and dotenv names are reported', () => {
  const listing = [
    'node_modules/',
    '.env',
    '.env.local',
    '.envrc',
    'apps/web/.env.production.local',
    'packages/database/.env',
    'apps/web/.next/',
    'notes/environment.md',
  ].join('\n');
  const exec = (command, args, cwd) => {
    assert.deepEqual([command, ...args, cwd], ['git', 'ls-files', '--others', '--directory', '/r']);
    return listing;
  };
  assert.deepEqual(localEnvFiles('/r', exec), [
    '.env',
    '.env.local',
    'apps/web/.env.production.local',
    'packages/database/.env',
  ]);
  const env = { PGPORT: '1', PGOPTIONS: 'x', DOTENV_CONFIG_PATH: 'p', PATH: '/bin', NOT_PG: '1' };
  assert.deepEqual(redirectingEnvNames(env), ['DOTENV_CONFIG_PATH', 'PGOPTIONS', 'PGPORT']);
});
