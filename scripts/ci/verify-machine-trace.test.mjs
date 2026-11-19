// The verifier's commands and Node's NODE_DEBUG diagnostics: commands see the lane environment
// unchanged, and while NODE_DEBUG is set no command starts, so no credential is printed.
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

test('with NODE_DEBUG set the verifier starts no command and prints no secret', () => {
  const secrets = {
    NODE_DEBUG: 'child_process',
    DATABASE_URL: 'postgresql://u:SENTINEL-secret@127.0.0.1:55438/db',
    SUPABASE_SERVICE_ROLE_KEY: 'SENTINEL-service-role',
    npm_config_https_proxy: 'http://u:SENTINEL-proxy@proxy.example.test:8080',
  };
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'verify-machine-debug-'));
  const cli = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, 'scripts/ci/verify-machine.mjs'), 'begin', 'security-guard'],
    { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...secrets } }
  );
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /PRE-CHECK lane=security-guard: NODE_DEBUG is set/u);
  // The marker check needs `ls` for ACLs, so under NODE_DEBUG it reports the marker untrusted.
  const markerFile = path.join(cwd, 'verify-machine.json');
  writeFileSync(markerFile, '{}');
  const trust = runChild(
    `const { readTrustedMarker } = await import(${moduleUrl('scripts/ci/verify-machine-trust.mjs')});` +
      `console.log(readTrustedMarker(${JSON.stringify(markerFile)}).status);`,
    secrets
  );
  rmSync(cwd, { recursive: true });
  assert.equal(trust.status, 0, trust.stderr);
  assert.equal(trust.stdout.trim(), 'invalid');
  for (const output of [cli, trust]) {
    assert.ok(!`${output.stdout}${output.stderr}`.includes('SENTINEL'));
    assert.ok(!output.stderr.includes('CHILD_PROCESS'), 'no command was started');
  }
});

test('with NODE_DEBUG set the run is a pre-check that starts no command', () => {
  const h = harness({ marker: trusted(), env: { NODE_DEBUG: 'child_process' } });
  h.deps.exec = () => assert.fail('no command may start');
  h.deps.readMarker = () => assert.fail('the marker check starts a command');
  for (const command of ['begin', 'stamp']) {
    assert.equal(runVerifyMachine([command, 'pr-verify'], h.deps), 0);
  }
  assert.match(h.output.log.join('\n'), /PRE-CHECK lane=pr-verify: NODE_DEBUG is set/u);
  assert.deepEqual(h.files(), []);
  assert.equal(runVerifyMachine(['describe'], h.deps), 1);
  assert.match(h.output.error.join('\n'), /NODE_DEBUG is set/u);
  h.cleanup();
});
