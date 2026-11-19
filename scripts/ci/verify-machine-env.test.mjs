import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { envFileOverrides, environmentErrors } from './verify-machine-env.mjs';
import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';

function errorsFor(env, overrides = []) {
  return environmentErrors(fixtureMarker(), { ...fixtureLive().env, ...env }, overrides);
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

test('a Sentry upload token or an env-file override fails the gate; values stay unprinted', () => {
  assert.deepEqual(errorsFor({ SENTRY_AUTH_TOKEN: 'set' }), [
    'SENTRY_AUTH_TOKEN must be unset for gate evidence',
  ]);
  assert.deepEqual(errorsFor({}, [{ file: '.env.local', key: 'E2E_DATABASE_URL' }]), [
    '.env.local sets E2E_DATABASE_URL; gate runs take it only from the checked environment',
  ]);
});

test('env-file scanning names every assignment of a guarded key, never its value', () => {
  const files = new Map([
    [path.join('/r', '.env'), 'SENTRY_AUTH_TOKEN=\nSENTRY_ORG=o\nOTHER=1\n'],
    [
      path.join('/r', '.env.local'),
      [
        'E2E_DATABASE_URL=postgresql://x@127.0.0.1:54322/p',
        'KS_HOST=" ks.127.0.0.1.nip.io:3000"',
        'MK_HOST: mk.127.0.0.1.nip.io:3000',
      ].join('\n'),
    ],
    [
      path.join('/r', 'apps/web/.env'),
      '  export   PORT = 3000\n# KS_HOST=commented\nNOT_KS_HOST=1\nDATABASE_URL_RLSX=1\n',
    ],
    [path.join('/r', 'apps/web/.env.local'), '# x\nexport SENTRY_AUTH_TOKEN="abc"\n'],
  ]);
  const read = file => {
    if (!files.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return files.get(file);
  };
  const overrides = envFileOverrides('/r', read);
  assert.deepEqual(overrides, [
    { file: '.env', key: 'SENTRY_AUTH_TOKEN' },
    { file: '.env.local', key: 'E2E_DATABASE_URL' },
    { file: '.env.local', key: 'KS_HOST' },
    { file: '.env.local', key: 'MK_HOST' },
    { file: 'apps/web/.env', key: 'PORT' },
    { file: 'apps/web/.env.local', key: 'SENTRY_AUTH_TOKEN' },
  ]);
  assert.ok(!JSON.stringify(overrides).includes('abc'));
});
