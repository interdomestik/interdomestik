import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';
import * as records from './verify-machine-records.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
const HEAD = 'c'.repeat(40);
const MARKER_SHA = 'f'.repeat(64);

function harness({ marker = { status: 'absent' }, live = fixtureLive(), env = {} } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'verify-machine-'));
  const output = { log: [], error: [] };
  const state = { marker, live, git: { head: HEAD, clean: true, trackedClean: true } };
  const deps = {
    env,
    platform: 'darwin',
    cwd: '/repo',
    exec: (command, args) => {
      assert.deepEqual([command, ...args], ['git', 'rev-parse', '--show-toplevel']);
      return '/repo';
    },
    readMarker: () => state.marker,
    probe: () => state.live,
    gitState: () => state.git,
    records: { ...records, recordDirectory: () => directory },
    now: () => '2026-11-19T10:00:00.000Z',
    log: message => output.log.push(message),
    error: message => output.error.push(message),
  };
  const files = () => readdirSync(directory).sort();
  const readFinal = () =>
    JSON.parse(
      readFileSync(
        path.join(
          directory,
          files().find(f => !f.startsWith('pending'))
        ),
        'utf8'
      )
    );
  return {
    deps,
    state,
    output,
    files,
    readFinal,
    cleanup: () => rmSync(directory, { recursive: true }),
  };
}

const trusted = (marker = fixtureMarker()) => ({ status: 'trusted', marker, sha256: MARKER_SHA });

test('pr:verify and security:guard begin and end with the machine check', () => {
  for (const [script, lane] of [
    ['pr:verify', 'pr-verify'],
    ['security:guard', 'security-guard'],
  ]) {
    const steps = packageJson.scripts[script].split(' && ');
    assert.equal(steps[0], `node scripts/ci/verify-machine.mjs begin ${lane}`);
    assert.equal(steps.at(-1), `node scripts/ci/verify-machine.mjs stamp ${lane}`);
    assert.equal(steps.filter(step => step.includes('verify-machine')).length, 2);
  }
});

test('without a marker the run is labelled a pre-check and still stamped', () => {
  const h = harness();
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  assert.match(h.output.log[0], /PRE-CHECK: no verification-machine marker/u);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  const record = h.readFinal();
  assert.equal(record.mode, 'PRE-CHECK');
  assert.equal(record.result, 'passed');
  assert.equal(h.files().filter(f => f.startsWith('pending')).length, 0);
  assert.match(h.output.log[1], /PRE-CHECK lane=pr-verify .* marker=none /u);
  h.cleanup();
});

test('a matching machine is stamped as gate evidence with its recorded configuration', () => {
  const h = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'security-guard'], h.deps), 0);
  assert.match(h.output.log[0], /GATE-EVIDENCE candidate/u);
  assert.equal(runVerifyMachine(['stamp', 'security-guard'], h.deps), 0);
  const record = h.readFinal();
  assert.equal(record.mode, 'GATE-EVIDENCE');
  assert.equal(record.markerSha256, MARKER_SHA);
  assert.equal(record.configuration.database.port, 55438);
  assert.ok(!JSON.stringify(record).includes('postgresql://'), 'no URLs or credentials');
  assert.match(h.output.log[1], new RegExp(`marker=${MARKER_SHA} record=.* record_sha256=`, 'u'));
  h.cleanup();
});

test('an untrusted marker or a mismatching machine fails before any step runs', () => {
  const invalid = harness({
    marker: { status: 'invalid', errors: ['marker file must be owned by root'] },
  });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], invalid.deps), 1);
  assert.match(invalid.output.error.join('\n'), /owned by root/u);
  assert.deepEqual(invalid.files(), []);
  invalid.cleanup();
  const live = fixtureLive({ env: { ...fixtureLive().env, PW_PORT: '3000' } });
  const mismatch = harness({ marker: trusted(), live });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], mismatch.deps), 1);
  assert.match(mismatch.output.error.join('\n'), /PW_PORT uses forbidden port 3000/u);
  mismatch.cleanup();
  const linux = harness({ marker: trusted() });
  linux.deps.platform = 'linux';
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], linux.deps), 1);
  linux.cleanup();
});

test('stamp refuses a missing begin, a moved HEAD, edited files or a changed marker', () => {
  const missing = harness();
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], missing.deps), 1);
  missing.cleanup();
  const cases = [
    [s => (s.git = { ...s.git, head: 'd'.repeat(40) }), /HEAD changed/u],
    [s => (s.git = { ...s.git, trackedClean: false }), /tracked files changed/u],
    [s => (s.marker = { ...trusted(), sha256: '0'.repeat(64) }), /marker changed/u],
    [s => (s.marker = { status: 'absent' }), /marker changed/u],
  ];
  for (const [change, message] of cases) {
    const h = harness({ marker: trusted() });
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
    change(h.state);
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
    assert.match(h.output.error.join('\n'), message);
    assert.ok(
      h.files().every(f => f.startsWith('pending')),
      'no final record'
    );
    h.cleanup();
  }
  const otherLane = harness();
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], otherLane.deps), 0);
  assert.equal(runVerifyMachine(['stamp', 'security-guard'], otherLane.deps), 1);
  otherLane.cleanup();
});

test('hosted runs and bad arguments are handled without records', () => {
  const hosted = harness({ marker: trusted(), env: { GITHUB_ACTIONS: 'true' } });
  assert.equal(runVerifyMachine(['begin', 'security-guard'], hosted.deps), 0);
  assert.equal(runVerifyMachine(['stamp', 'security-guard'], hosted.deps), 0);
  assert.match(hosted.output.log[0], /hosted run/u);
  assert.deepEqual(hosted.files(), []);
  hosted.cleanup();
  const bad = harness();
  for (const argv of [
    [],
    ['begin'],
    ['begin', 'e2e'],
    ['finish', 'pr-verify'],
    ['begin', 'pr-verify', 'x'],
  ]) {
    assert.equal(runVerifyMachine(argv, bad.deps), 1, argv.join(' '));
  }
  bad.cleanup();
});

test('describe prints a valid proposed marker and never writes one', () => {
  const h = harness();
  assert.equal(runVerifyMachine(['describe'], h.deps), 0);
  const proposed = JSON.parse(h.output.log[0]);
  assert.equal(proposed.database.port, 55438);
  assert.deepEqual(proposed.forbidden_ports, [3000, 54322]);
  assert.match(h.output.error.at(-1), /install it as root at \/Library\/Application Support/u);
  assert.deepEqual(h.files(), []);
  assert.equal(runVerifyMachine(['describe', '--unknown=1'], h.deps), 1);
  h.state.live = fixtureLive({ database: null });
  assert.equal(runVerifyMachine(['describe'], h.deps), 1);
  h.cleanup();
});
