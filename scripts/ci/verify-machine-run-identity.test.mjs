// Plain marker names, the recorded database, one final record per run, and stamps after begin.
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { compareMachine } from './verify-machine-compare.mjs';
import { parseDescribeOptions } from './verify-machine-describe.mjs';
import { fixtureLive, fixtureMarker } from './verify-machine-fixtures.mjs';
import { harness, trusted } from './verify-machine-harness.mjs';
import { validateMarker } from './verify-machine-marker.mjs';
import { probeMachine } from './verify-machine-probe.mjs';
import { publishRecord } from './verify-machine-records.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

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

test('the recorded database is listed inside its container; no operator value reaches argv', () => {
  const calls = [];
  const exec = (command, args) => {
    calls.push([command, ...args]);
    if (command !== 'docker') return '';
    const joined = args.join(' ');
    if (joined === 'context show') return 'orbstack';
    if (joined.startsWith('context inspect')) return '"unix:///var/run/fixture.sock"';
    if (args.includes('ps')) return `${'a'.repeat(64)}\tida-mac-verify-pg,alias`;
    if (args.includes('inspect')) return `postgres:16@x|true|{}`;
    if (args.includes('exec')) return '["interdomestik_test","postgres"]';
    return '';
  };
  const live = probeMachine({ repoRoot: REPO_ROOT, marker: fixtureMarker(), env: {}, exec });
  assert.deepEqual(live.databaseNames, ['interdomestik_test', 'postgres']);
  assert.equal(live.container.localSocket, true);
  const docker = calls.filter(([command]) => command === 'docker').map(([, ...args]) => args);
  for (const args of docker.filter(args => !args[0].startsWith('context'))) {
    assert.deepEqual(args.slice(0, 2), ['--host', 'unix:///var/run/fixture.sock']);
  }
  const later = docker.filter(args => args[0] === '--host').flat();
  assert.ok(!later.includes('ida-mac-verify-pg'), 'the container is addressed by its ID');
  assert.ok(!later.includes('interdomestik_test'), 'the database name is compared in JavaScript');

  for (const databaseNames of [null, ['postgres']]) {
    const errors = compareMachine(fixtureMarker(), { ...fixtureLive(), databaseNames });
    assert.match(errors.join('\n'), /database list .* unreadable|recorded database is not in/u);
    assert.ok(!errors.join('\n').includes('interdomestik_test'));
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
  assert.match(h.output.error.join('\n'), /cannot be checked with NODE_OPTIONS set/u);
  assert.ok(!h.output.log.some(line => line.startsWith('GATE-EVIDENCE')));

  // Another shell without a begin record of the lane stays a pre-check that records nothing.
  h.deps.shellPid = 5151;
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.match(
    h.output.log.at(-1),
    /only the marker ACL check and the shell start-time lookup may have run/u
  );
  h.cleanup();
});
