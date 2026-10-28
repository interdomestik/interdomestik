import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import yaml from 'js-yaml';
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

function auditWorkflow(workflow) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const contract = yaml.load(
    fs.readFileSync(path.join(root, 'docs/delivery-contract.yml'), 'utf8')
  );
  const check = contract.checks.find(row => row.id === 'orchestration.ci_green_path');
  assert.ok(check, 'The ordinary Golden Path contract must remain present');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-admin-orchestration-'));
  try {
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.mkdirSync(path.join(dir, '.github/workflows'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'docs/delivery-contract.yml'),
      yaml.dump({ version: contract.version, checks: [check] })
    );
    fs.writeFileSync(path.join(dir, '.github/workflows/ci.yml'), workflow);
    return spawnSync(process.execPath, [path.join(root, 'scripts/track-audit.mjs')], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 10_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const workflow = fs.readFileSync(
  fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
  'utf8'
);
test('the actual governance auditor accepts both fixed isolated seed operations in CI', () => {
  const result = auditWorkflow(workflow);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test('governance refuses missing, commented, or direct-profile replacements for either fixed operation', () => {
  for (const mode of ['seed', 'assert']) {
    const command = `node scripts/ci/run-e2e-seed-admin.mjs ${mode}`;
    assert.ok(workflow.includes(command));
    for (const replacement of [
      '',
      '# ' + command,
      mode === 'seed' ? 'pnpm seed:e2e' : 'pnpm seed:assert-e2e',
    ]) {
      const result = auditWorkflow(workflow.replace(command, replacement));
      assert.ifError(result.error);
      assert.equal(result.status, 1, `${mode} must require its executed isolated child`);
      assert.match(result.stderr, /orchestration\.ci_green_path failed/);
    }
  }
});
