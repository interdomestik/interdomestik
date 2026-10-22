import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { administrativeSeedProfile, runAdministrativeSeed } from './run-e2e-seed-admin.mjs';

const admin = 'postgresql://postgres:synthetic@127.0.0.1:5432/interdomestik_test';
const app = 'postgresql://app:synthetic@127.0.0.1:5432/interdomestik_test';
const parent = Object.freeze({
  DATABASE_URL: admin,
  DATABASE_URL_RLS: app,
  E2E_DATABASE_URL_RLS: app,
  DB_RLS_ROLE: 'restricted_app',
});

test('both fixed operations use an isolated admin child and preserve the application profile', () => {
  for (const mode of ['seed', 'assert']) {
    const before = { ...parent };
    const profile = administrativeSeedProfile(mode, parent);
    assert.equal(profile.env.DATABASE_URL_RLS, admin);
    assert.equal(profile.env.E2E_DATABASE_URL_RLS, admin);
    assert.equal(profile.env.DB_RLS_ROLE, '');
    assert.deepEqual(parent, before);
    assert.deepEqual(
      profile.args,
      mode === 'seed' ? ['seed:e2e', '--', '--reset'] : ['seed:assert-e2e']
    );
  }
});

test('production, required RLS and non-local targets refuse before execution', () => {
  for (const override of [
    { NODE_ENV: 'production' },
    { VERCEL: '1' },
    { VERCEL_ENV: 'production' },
    { REQUIRE_RLS_INTEGRATION: '1' },
    { DATABASE_URL: admin.replace('127.0.0.1', 'example.com') },
    { DATABASE_URL: admin.replace('postgres:synthetic', 'app:synthetic') },
    { DATABASE_URL: admin.replace('interdomestik_test', 'production') },
    { DATABASE_URL: `${admin}?options=-crole=postgres` },
    { DATABASE_URL: '' },
  ])
    assert.throws(() => administrativeSeedProfile('seed', { ...parent, ...override }));
  assert.throws(() => administrativeSeedProfile('shell', parent));
});

test('child failures propagate and explicit child values resist dotenv restoration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-admin-contract-'));
  try {
    const script = path.join(dir, 'pnpm');
    const dotenv = fileURLToPath(
      new URL('../../packages/database/node_modules/dotenv/lib/main.js', import.meta.url)
    );
    const envFile = path.join(dir, '.env');
    fs.writeFileSync(
      envFile,
      `DATABASE_URL_RLS=${app}\nDB_RLS_ROLE=restricted_app\nNODE_ENV=production\n`
    );
    fs.writeFileSync(
      script,
      `#!${process.execPath}\nconst assert = require('node:assert/strict');\nrequire(${JSON.stringify(dotenv)}).config({path:${JSON.stringify(envFile)}});\nassert.equal(process.env.DATABASE_URL_RLS, ${JSON.stringify(admin)});\nassert.equal(process.env.DB_RLS_ROLE, '');\nassert.equal(process.env.NODE_ENV, 'development');\nprocess.exit(23);\n`,
      { mode: 0o700 }
    );
    const env = { ...parent, PATH: dir };
    const before = { ...env };
    for (const mode of ['seed', 'assert']) assert.equal(runAdministrativeSeed(mode, env), 23);
    assert.deepEqual(env, before);
    const cli = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./run-e2e-seed-admin.mjs', import.meta.url)), 'seed', 'extra'],
      { env, encoding: 'utf8' }
    );
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /Expected one fixed administrative seed operation/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
