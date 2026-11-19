// The verifier's commands and diagnostics: commands see the lane environment unchanged; outside
// the closed gate environment no command starts, so no tracing variable can print a credential.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

import { harness, trusted } from './verify-machine-harness.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Runs `script` (an ES module body) in a child Node with only the given environment.
function runChild(script, env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
}
const moduleUrl = name => JSON.stringify(pathToFileURL(path.join(REPO_ROOT, name)).href);

test('verifier commands see the lane environment unchanged', () => {
  const lane = {
    NPM_CONFIG_BAIL: 'false',
    npm_config_bail: '',
    DOCKER_TLS_VERIFY: '1',
    DOCKER_CERT_PATH: '/nonexistent-certs',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'color.ui',
    GIT_CONFIG_VALUE_0: 'false',
  };
  const result = runChild(
    `const { runCommand } = await import(${moduleUrl('scripts/ci/verify-machine-exec.mjs')});` +
      "console.log(runCommand('/usr/bin/env', []));",
    lane
  );
  assert.equal(result.status, 0, result.stderr);
  const seen = result.stdout.split('\n');
  for (const [name, value] of Object.entries(lane)) assert.ok(seen.includes(`${name}=${value}`));
});

test('tracing variables never make the verifier print a credential', () => {
  const secrets = {
    DATABASE_URL: 'postgresql://u:SENTINEL-secret@127.0.0.1:55438/db',
    SUPABASE_SERVICE_ROLE_KEY: 'SENTINEL-service-role',
    npm_config_https_proxy: 'http://u:SENTINEL-proxy@proxy.example.test:8080',
  };
  const tracing = [
    { NODE_DEBUG: 'child_process' },
    { GIT_TRACE2_EVENT: '1', GIT_TRACE2_ENV_VARS: 'SUPABASE_SERVICE_ROLE_KEY' },
    { NODE_OPTIONS: '--report-uncaught-exception --report-filename=stderr' },
  ];
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'verify-machine-debug-'));
  const markerFile = path.join(cwd, 'verify-machine.json');
  writeFileSync(markerFile, '{}');
  const script = path.join(REPO_ROOT, 'scripts/ci/verify-machine.mjs');
  for (const trace of tracing) {
    const env = { PATH: process.env.PATH, HOME: process.env.HOME, ...secrets, ...trace };
    for (const argv of [['begin', 'security-guard'], ['describe']]) {
      const cli = spawnSync(process.execPath, [script, ...argv], { cwd, encoding: 'utf8', env });
      assert.ok(!`${cli.stdout}${cli.stderr}`.includes('SENTINEL'), JSON.stringify(trace));
    }
    // The marker check lists ACLs with an empty environment.
    const trust = runChild(
      `const { readTrustedMarker } = await import(${moduleUrl('scripts/ci/verify-machine-trust.mjs')});` +
        `console.log(readTrustedMarker(${JSON.stringify(markerFile)}).status);`,
      { ...secrets, ...trace }
    );
    assert.equal(trust.stdout.trim(), 'invalid');
    assert.ok(!`${trust.stdout}${trust.stderr}`.includes('SENTINEL'), JSON.stringify(trace));
  }
  rmSync(cwd, { recursive: true });
});

test('outside the gate environment the run is a pre-check that starts no command', () => {
  const h = harness({ marker: trusted(), env: { NODE_OPTIONS: '--test-name-pattern=x' } });
  h.deps.exec = () => assert.fail('no command may start');
  for (const command of ['begin', 'stamp']) {
    assert.equal(runVerifyMachine([command, 'pr-verify'], h.deps), 0);
  }
  assert.match(h.output.log.join('\n'), /PRE-CHECK lane=pr-verify: .*\(NODE_OPTIONS\)/u);
  assert.deepEqual(h.files(), []);
  assert.equal(runVerifyMachine(['describe'], h.deps), 1);
  assert.match(h.output.error.join('\n'), /describe runs only in the gate environment/u);
  // An untrusted marker still stops the run.
  h.state.marker = { status: 'invalid', errors: ['marker file must be owned by root'] };
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 1);
  h.cleanup();
});
