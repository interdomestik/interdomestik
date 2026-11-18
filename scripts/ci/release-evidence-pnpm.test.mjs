import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Runs the release evidence scripts through pnpm itself: options written before the script name
// become pnpm configuration, and repeated ones are dropped entirely, so the package scripts must
// carry the mode and a requested verification must fail rather than fall back to manifest-only.
const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);
const pnpmCli = /pnpm\.c?js$/u.test(process.env.npm_execpath ?? '')
  ? process.env.npm_execpath
  : null;

function pnpm(args, env = {}) {
  const [command, prefix] = pnpmCli ? [process.execPath, [pnpmCli]] : ['pnpm', []];
  const result = spawnSync(command, [...prefix, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.error, undefined, `pnpm did not start: ${result.error?.message}`);
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function withStore(callback) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-evidence-pnpm-'));
  try {
    callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertRefused(result, label) {
  assert.notEqual(result.status, 0, `${label}: ${result.output}`);
  assert.match(result.output, /FAIL invalid arguments/, label);
  assert.doesNotMatch(result.output, /PASS gates=/, label);
}

test('the check script checks the manifest alone and says the files are unverified', () => {
  const result = pnpm(['release:evidence:check']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /PASS gates=10 files=not-verified \(manifest only\)/);
});

test('the verify script verifies the files in the named store', () => {
  withStore(store => {
    const result = pnpm(['release:evidence:verify', store]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /G01: evidence file not found: /);
  });
});

test('evidence options pnpm took or dropped before the script name stop the check', () => {
  withStore(store => {
    const cases = {
      'repeated before verify': [
        `--evidence-root=${store}`,
        '--evidence-root=',
        'release:evidence:verify',
      ],
      'single before verify': [`--evidence-root=${store}`, 'release:evidence:verify'],
      'single before check': [`--evidence-root=${store}`, 'release:evidence:check'],
      'verify without a store': ['release:evidence:verify'],
      'check with a store': ['release:evidence:check', '--evidence-root', store],
    };
    for (const [label, args] of Object.entries(cases)) assertRefused(pnpm(args), label);
  });
});

test('evidence settings from a user configuration file stop the check in any spelling', () => {
  withStore(dir => {
    const userconfig = path.join(dir, 'npmrc');
    for (const line of [`Evidence-Root=${dir}`, `evidenceRoot=${dir}`, 'Manifest=other.yaml']) {
      writeFileSync(userconfig, `${line}\n`);
      assertRefused(pnpm(['release:evidence:check'], { npm_config_userconfig: userconfig }), line);
    }
    writeFileSync(userconfig, `evidence-root[]=${dir}\n`);
    assertRefused(
      pnpm(['release:evidence:verify'], { npm_config_userconfig: userconfig }),
      'array setting'
    );
  });
});
