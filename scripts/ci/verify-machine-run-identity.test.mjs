// Plain marker names, the recorded database, one final record per run, and stamps after begin.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compareMachine } from './verify-machine-compare.mjs';
import { parseDescribeOptions } from './verify-machine-describe.mjs';
import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';
import { harness, trusted } from './verify-machine-harness.mjs';
import { validateMarker } from './verify-machine-marker.mjs';
import { probeMachine } from './verify-machine-probe.mjs';
import { publishRecord } from './verify-machine-records.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

test('describe refuses option values that are not plain before probing anything', () => {
  assert.ok(parseDescribeOptions([]));
  assert.ok(parseDescribeOptions(['--db-name=interdomestik_test', '--db-port=55438']));
  for (const argument of [
    '--db-name=postgresql://user:secret@127.0.0.1:55438/interdomestik_test',
    '--container=ida;rm',
    '--db-port=55438x',
    '--app-port=-1',
    '--db-host=127.0.0.1/x',
    '--min-free-gib=lots',
  ]) {
    assert.equal(parseDescribeOptions([argument]), null, argument);
  }
});

test('a marker with a connection URL as its database or container name is refused', () => {
  for (const [field, value, message] of [
    ['name', 'postgresql://user:secret@127.0.0.1/x', /database\.name must be a plain/u],
    ['container', 'a b', /database\.container must be a plain/u],
  ]) {
    const marker = fixtureMarker();
    marker.database[field] = value;
    assert.match(validateMarker(marker).join('\n'), message);
  }
  assert.deepEqual(validateMarker(fixtureMarker()), []);
});

test('the recorded database is checked inside its container, never through a URL', () => {
  const calls = [];
  const exec = (command, args) => {
    calls.push([command, ...args].join(' '));
    return args[0] === 'exec' ? 'interdomestik_test\n' : '';
  };
  const live = probeMachine({ repoRoot: REPO_ROOT, marker: fixtureMarker(), env: {}, exec });
  assert.equal(live.databaseName, 'interdomestik_test');
  const psql = calls.find(call => call.includes('psql'));
  assert.match(psql, /^docker exec ida-mac-verify-pg psql --no-psqlrc .* -d interdomestik_test /u);
  assert.doesNotMatch(psql, /postgres(?:ql)?:\/\//u);

  for (const databaseName of [null, 'postgres']) {
    const errors = compareMachine(fixtureMarker(), { ...fixtureLive(), databaseName });
    assert.deepEqual(errors, [
      'database interdomestik_test is not reachable in container ida-mac-verify-pg',
    ]);
  }
});

test('a final record is published once; a second stamp of the same run fails', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'verify-machine-publish-'));
  const target = path.join(directory, 'pr-verify-cccccccccccc-run-1.json');
  publishRecord(target, { result: 'passed' });
  assert.throws(() => publishRecord(target, { result: 'forged' }), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(readFileSync(target, 'utf8')), { result: 'passed' });
  assert.deepEqual(readdirSync(directory), ['pr-verify-cccccccccccc-run-1.json']);
  rmSync(directory, { recursive: true });

  const h = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  const [pendingName] = h.files();
  const pendingText = readFileSync(path.join(h.directory, pendingName), 'utf8');
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.equal(h.readFinal().runId, 'run-1');
  writeFileSync(path.join(h.directory, pendingName), pendingText);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  assert.match(h.output.error.join('\n'), /run run-1 already has a final record/u);
  assert.equal(h.output.log.filter(line => line.startsWith('GATE-EVIDENCE')).length, 1);
  h.cleanup();
});

test('a variable added after begin fails the stamp of that shell', () => {
  const h = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  h.state.git.head = 'd'.repeat(40);
  h.deps.env = { ...h.deps.env, NODE_OPTIONS: '--trace-warnings' };
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
  assert.match(h.output.error.join('\n'), /added after begin \(NODE_OPTIONS\); not stamped/u);
  assert.ok(!h.output.log.some(line => line.startsWith('GATE-EVIDENCE')));

  // Another shell without a begin record of the lane stays a pre-check that records nothing.
  h.deps.shellPid = 5151;
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.match(
    h.output.log.at(-1),
    /only the marker was checked, nothing else ran or was recorded/u
  );
  h.cleanup();
});
