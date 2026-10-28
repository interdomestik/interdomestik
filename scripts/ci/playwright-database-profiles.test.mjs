import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  configurePlaywrightDatabaseProfiles,
  resolvePlaywrightDatabaseProfiles,
  validateApplicationDatabaseProfile,
} from './playwright-database-profiles.mjs';

const admin = 'postgresql://postgres:fixture@127.0.0.1:5432/interdomestik_test';
const restricted = 'postgresql://app_fixture:fixture@127.0.0.1:5432/interdomestik_test';
const parent = Object.freeze({
  DATABASE_URL: admin,
  E2E_DATABASE_URL: admin,
  DATABASE_URL_RLS: restricted,
  E2E_DATABASE_URL_RLS: restricted,
  DB_RLS_ROLE: 'app_fixture',
});

test('fixture driver and spawned application stay separate across worker config reloads', () => {
  const profiles = resolvePlaywrightDatabaseProfiles(parent);
  assert.equal(profiles.driver.DATABASE_URL_RLS, admin);
  assert.equal(profiles.driver.DB_RLS_ROLE, '');
  assert.equal(profiles.application.DATABASE_URL_RLS, restricted);
  assert.equal(profiles.application.E2E_DATABASE_URL_RLS, restricted);
  assert.equal(profiles.application.DB_RLS_ROLE, 'app_fixture');
  const worker = { ...parent, ...profiles.driver };
  assert.deepEqual(resolvePlaywrightDatabaseProfiles(worker), profiles);
  assert.equal(parent.DATABASE_URL_RLS, restricted);
  assert.equal(parent.DB_RLS_ROLE, 'app_fixture');
});

test('administrative driver refuses production and mismatched or privileged app profiles', () => {
  for (const override of [
    { NODE_ENV: 'production' },
    { VERCEL: '1' },
    { REQUIRE_RLS_INTEGRATION: '1' },
    { INTERDOMESTIK_DB_PROFILE_SHA256: 'prebound' },
    { E2E_DATABASE_URL_RLS: restricted.replace('5432', '5433') },
    { E2E_DATABASE_URL_RLS: restricted.replace('127.0.0.1', 'example.com') },
    { E2E_DATABASE_URL_RLS: restricted.replace('interdomestik_test', 'other') },
    { E2E_DATABASE_URL_RLS: `${restricted}?options=-crole=postgres` },
    {
      E2E_DATABASE_URL_RLS: admin.replace('postgres:fixture', '%70ostgres:fixture'),
      DB_RLS_ROLE: 'postgres',
    },
    { DB_RLS_ROLE: 'other' },
    { DB_RLS_ROLE: '' },
    { PW_APP_DATABASE_URL: admin },
  ])
    assert.throws(() => resolvePlaywrightDatabaseProfiles({ ...parent, ...override }));
  assert.deepEqual(
    resolvePlaywrightDatabaseProfiles({ DATABASE_URL: admin, DATABASE_URL_RLS: admin }),
    { driver: {}, application: {} }
  );
});

test('isolated app spawn cannot replace restricted profile or select a different database', () => {
  const { driver } = resolvePlaywrightDatabaseProfiles(parent);
  const app = {
    ...parent,
    ...driver,
    NODE_ENV: 'production',
    DATABASE_URL_RLS: admin,
    E2E_DATABASE_URL_RLS: admin,
  };
  assert.equal(validateApplicationDatabaseProfile(app).DATABASE_URL_RLS, restricted);
  assert.throws(() =>
    validateApplicationDatabaseProfile({ ...app, DATABASE_URL: admin.replace('5432', '5433') })
  );
  assert.throws(() =>
    validateApplicationDatabaseProfile({ ...app, PW_APP_DATABASE_URL_RLS: admin })
  );
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const source = fs.readFileSync(path.join(root, 'scripts/ci/e2e-webserver-database.sh'), 'utf8');
  const start = source.indexOf('if [[ -n "${PW_APP_DATABASE_URL+x}');
  assert.ok(start > 0);
  const block = source.slice(start, source.indexOf('\nfi', start) + 3);
  const command = `set -euo pipefail\n${block}\nnode -e 'process.stdout.write(JSON.stringify([process.env.DATABASE_URL_RLS,process.env.E2E_DATABASE_URL_RLS,process.env.DB_RLS_ROLE,process.env.NODE_ENV]))'`;
  const result = spawnSync('/bin/bash', ['-c', command], {
    env: { PATH: process.env.PATH, ROOT_DIR: root, ...app },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    restricted,
    restricted,
    'app_fixture',
    'production',
  ]);
  const refused = spawnSync('/bin/bash', ['-c', command], {
    env: {
      PATH: process.env.PATH,
      ROOT_DIR: root,
      ...app,
      DATABASE_URL: admin.replace('5432', '5433'),
    },
    encoding: 'utf8',
  });
  assert.notEqual(refused.status, 0);
  assert.equal(refused.stdout, '');
});

test('malformed credential-bearing URLs never escape in diagnostics', () => {
  const { application } = resolvePlaywrightDatabaseProfiles(parent);
  for (const input of [
    'postgresql://app:PRIVATE_PASSWORD@[invalid/db',
    restricted.replace('app_fixture', '%ZZ'),
  ]) {
    assert.throws(
      () =>
        validateApplicationDatabaseProfile({
          ...parent,
          ...application,
          PW_APP_DATABASE_URL_RLS: input,
        }),
      error => {
        assert.equal(error.message, 'Invalid E2E application database profile');
        assert.equal(error.cause, undefined);
        assert.equal(error.input, undefined);
        assert.ok(!String(error.stack).includes('PRIVATE_PASSWORD'));
        assert.ok(!String(error.stack).includes(input));
        return true;
      }
    );
  }
});

test('configuration normalizes legacy defaults and explicit E2E targets before driver resolution', () => {
  const legacy = configurePlaywrightDatabaseProfiles({});
  assert.equal(
    legacy.driver.DATABASE_URL,
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  );
  assert.equal(legacy.driver.DATABASE_URL_RLS, legacy.driver.DATABASE_URL);
  assert.deepEqual(legacy.application, {});
  const configured = configurePlaywrightDatabaseProfiles({
    ...parent,
    DATABASE_URL: 'ignored',
    E2E_DATABASE_URL: ` ${admin} `,
  });
  assert.equal(configured.driver.DATABASE_URL, admin);
  assert.equal(configured.application.DATABASE_URL_RLS, restricted);
});
