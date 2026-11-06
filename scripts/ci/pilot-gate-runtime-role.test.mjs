import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

// S8 pilot runtime parity: the hosted Pilot Gate's app connects its tenant client as the
// restricted E2E runtime role, exactly like the E2E web server, while migrations and seeding keep
// the administrative connection. Provisioning runs first and a failure prevents server startup.

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = yaml.load(
  fs.readFileSync(path.join(rootDir, '.github/workflows/pilot-gate.yml'), 'utf8')
);
const job = workflow.jobs['pilot-gate-runner'];
const stepNamed = name => job.steps.find(step => step.name === name);
const start = stepNamed('Start web server for release gate');
const prepare = stepNamed('Prepare CI database');
const ADMIN_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/interdomestik_test';
const RUNTIME_URL = 'postgresql://interdomestik_e2e_runtime:r@127.0.0.1:5432/interdomestik_test';

test('pilot gate: the server starts only after the restricted runtime role is provisioned', () => {
  const lines = start.run.split('\n').map(line => line.trim());
  const provision = lines.findIndex(line => line.includes('scripts/e2e-runtime-role-cli.mjs'));
  const launch = lines.findIndex(line => line.includes('run start:ci'));
  assert.equal(lines[0], 'set -euo pipefail');
  assert.ok(provision > 0 && provision < launch);
  assert.equal(
    lines[provision],
    'runtime_url="$(E2E_DATABASE_URL="${DATABASE_URL}" node scripts/e2e-runtime-role-cli.mjs --print-url)"'
  );
  assert.equal(lines[launch - 1], 'DATABASE_URL_RLS="${runtime_url}" REQUIRE_RLS_INTEGRATION=1 \\');
  assert.ok(!lines[provision].includes('||'), 'no fallback when provisioning fails');
});

test('pilot gate: migrations and seeding keep the administrative connection', () => {
  assert.equal(job.env.DATABASE_URL, ADMIN_URL);
  assert.equal(job.env.PLAYWRIGHT, '1');
  assert.ok(!('DB_RLS_ROLE' in job.env), 'the runtime role cannot assume DB_RLS_ROLE');
  assert.ok(!prepare.run.includes('DATABASE_URL_RLS'));
  assert.ok(!prepare.run.includes('e2e-runtime-role'));
  for (const command of ['pnpm db:migrate', 'pnpm seed:e2e', 'pnpm seed:assert-e2e'])
    assert.ok(prepare.run.includes(command), command);
});

function stubbed({ provisionExit }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-runtime-role-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const write = (name, body) =>
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  write(
    'node',
    `printf '%s|%s' "$E2E_DATABASE_URL" "$*" > "${dir}/node.args"\n` +
      (provisionExit === 0 ? `printf '%s' '${RUNTIME_URL}'` : `exit ${provisionExit}`)
  );
  write('pnpm', `printf '%s|%s' "$DATABASE_URL_RLS" "$REQUIRE_RLS_INTEGRATION" > "${dir}/started"`);
  write('curl', 'exit 0');
  write('sleep', 'exit 0');
  const script = start.run.replaceAll('/tmp/', `${dir}/`);
  const result = spawnSync('bash', ['-c', script], {
    cwd: dir,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, DATABASE_URL: ADMIN_URL },
  });
  return { dir, result };
}

function waitForFile(file) {
  for (let attempt = 0; attempt < 50 && !fs.existsSync(file); attempt += 1)
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 100)']);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

test('pilot gate: the started server receives the restricted URL and enforces RLS readiness', () => {
  const { dir, result } = stubbed({ provisionExit: 0 });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(waitForFile(path.join(dir, 'started')), `${RUNTIME_URL}|1`);
    assert.equal(
      fs.readFileSync(path.join(dir, 'node.args'), 'utf8'),
      `${ADMIN_URL}|scripts/e2e-runtime-role-cli.mjs --print-url`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pilot gate: a provisioning failure stops the step before the server starts', () => {
  const { dir, result } = stubbed({ provisionExit: 1 });
  try {
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(path.join(dir, 'started')), false);
    assert.equal(fs.existsSync(path.join(dir, 'web-start.pid')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
