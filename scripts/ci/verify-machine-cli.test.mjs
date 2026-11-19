import assert from 'node:assert/strict';
import { utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { fixtureLive } from './verify-machine-fixtures.mjs';
import { harness, MARKER_SHA, packageJson, trusted } from './verify-machine-harness.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

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
  const h = harness({ marker: trusted(), env: { npm_lifecycle_event: 'security:guard' } });
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

test('an untrusted marker stops the run; a mismatching or non-macOS machine is a pre-check', () => {
  const invalid = harness({
    marker: { status: 'invalid', errors: ['marker file must be owned by root'] },
  });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], invalid.deps), 1);
  assert.match(invalid.output.error.join('\n'), /owned by root/u);
  assert.deepEqual(invalid.files(), []);
  invalid.cleanup();
  const live = fixtureLive({ env: { ...fixtureLive().env, PW_PORT: '3000' } });
  const mismatch = harness({ marker: trusted(), live });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], mismatch.deps), 0);
  assert.match(mismatch.output.log.join('\n'), /PW_PORT uses forbidden port 3000/u);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], mismatch.deps), 0);
  assert.equal(mismatch.readFinal().mode, 'PRE-CHECK');
  assert.deepEqual(mismatch.readFinal().reasons, ['PW_PORT uses forbidden port 3000']);
  mismatch.cleanup();
  const linux = harness({ marker: trusted() });
  linux.deps.platform = 'linux';
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], linux.deps), 0);
  assert.match(linux.output.log[0], /PRE-CHECK: a marker is present on a non-macOS host/u);
  linux.cleanup();
  const unprobed = harness({ marker: trusted() });
  unprobed.deps.probe = () => {
    throw new Error('docker unavailable');
  };
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], unprobed.deps), 0);
  assert.match(unprobed.output.log[0], /PRE-CHECK: this machine could not be probed/u);
  unprobed.cleanup();
});
test('a stamp without its begin in the same shell is never gate evidence', () => {
  const missing = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], missing.deps), 0);
  assert.match(missing.output.log.join('\n'), /no begin record in this shell; nothing recorded/u);
  assert.deepEqual(missing.files(), []);
  missing.cleanup();
  const failedEarlier = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], failedEarlier.deps), 0);
  failedEarlier.deps.shellPid = 5151;
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], failedEarlier.deps), 0);
  assert.ok(
    failedEarlier.files().every(f => f.startsWith('pending')),
    'no final record'
  );
  failedEarlier.cleanup();
});
test('concurrent shells keep their own pending records', () => {
  const h = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  h.deps.shellPid = 5151;
  h.state.marker = { status: 'absent' };
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  assert.equal(h.files().length, 2);
  h.deps.shellPid = 4242;
  h.state.marker = trusted();
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
  assert.equal(h.readFinal().mode, 'GATE-EVIDENCE');
  h.cleanup();
});

test('a pre-check whose record cannot be written still runs', () => {
  const h = harness();
  h.deps.records = {
    ...h.deps.records,
    writeRecord: () => {
      throw Object.assign(new Error('read-only'), { code: 'EROFS' });
    },
  };
  assert.equal(runVerifyMachine(['begin', 'security-guard'], h.deps), 0);
  assert.match(h.output.error[0], /pre-check record not written \(EROFS\); continuing/u);
  h.cleanup();
});

test('a pre-check whose final record fills the disk still passes; gate evidence does not', () => {
  for (const [marker, expected] of [
    [undefined, 0],
    [trusted(), 'throws'],
  ]) {
    const h = harness({ marker });
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
    h.deps.records = {
      ...h.deps.records,
      publishRecord: () => {
        throw Object.assign(new Error('full'), { code: 'ENOSPC' });
      },
    };
    if (expected === 'throws') {
      assert.throws(() => runVerifyMachine(['stamp', 'pr-verify'], h.deps), /full/u);
    } else {
      assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
      assert.match(h.output.error[0], /pre-check record not written \(ENOSPC\); continuing/u);
    }
    h.cleanup();
  }
});

test('stamp re-checks the live machine, HEAD, tracked files and the marker', () => {
  const live = fixtureLive();
  const headMoved = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], headMoved.deps), 0);
  headMoved.state.live = { ...live, git: { ...live.git, head: 'd'.repeat(40) } };
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], headMoved.deps), 1);
  assert.match(headMoved.output.error.join('\n'), /HEAD changed/u);
  assert.ok(
    headMoved.files().every(f => f.startsWith('pending')),
    'no final record'
  );
  headMoved.cleanup();
  const cases = [
    [s => (s.live = { ...live, git: { ...live.git, trackedClean: false } }), /tracked files/u],
    [s => (s.live = { ...live, database: { ...live.database, running: false } }), /not running/u],
    [s => (s.live = { ...live, env: { ...live.env, PW_PORT: '3000' } }), /forbidden port 3000/u],
    [s => (s.marker = { ...trusted(), sha256: '0'.repeat(64) }), /marker changed/u],
    [s => (s.marker = { status: 'absent' }), /marker changed/u],
  ];
  for (const [change, message] of cases) {
    const h = harness({ marker: trusted() });
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
    change(h.state);
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 0);
    assert.match(h.output.log.join('\n'), /PRE-CHECK: the run stopped matching/u);
    const record = h.readFinal();
    assert.equal(record.mode, 'PRE-CHECK');
    assert.match(record.reasons.join('\n'), message);
    h.cleanup();
  }
  const otherLane = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], otherLane.deps), 0);
  assert.equal(runVerifyMachine(['stamp', 'security-guard'], otherLane.deps), 0);
  assert.ok(
    otherLane.files().every(f => f.startsWith('pending')),
    'no final record'
  );
  otherLane.cleanup();
  const preCheckHead = harness();
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], preCheckHead.deps), 0);
  preCheckHead.state.git = { ...preCheckHead.state.git, head: 'd'.repeat(40) };
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], preCheckHead.deps), 1);
  preCheckHead.cleanup();
});

test('a marker that became untrusted during the run stops the stamp in either mode', () => {
  for (const marker of [trusted(), undefined]) {
    const h = harness(marker ? { marker } : {});
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
    h.state.marker = { status: 'invalid', errors: ['marker file must be owned by root'] };
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
    assert.match(h.output.error.join('\n'), /not trusted[\s\S]*owned by root/u);
    assert.ok(
      h.files().every(f => f.startsWith('pending')),
      'no final record'
    );
    h.cleanup();
  }
});

test('begin prunes pending records older than a day and keeps recent ones', () => {
  const h = harness();
  const old = path.join(h.directory, 'pending-pr-verify-old.json');
  const recent = path.join(h.directory, 'pending-pr-verify-recent.json');
  writeFileSync(old, '{}');
  writeFileSync(recent, '{}');
  const dayAgo = (Date.parse('2026-11-19T10:00:00.000Z') - 24 * 60 * 60 * 1000) / 1000;
  utimesSync(old, dayAgo, dayAgo);
  utimesSync(
    recent,
    Date.parse('2026-11-19T09:00:00.000Z') / 1000,
    Date.parse('2026-11-19T09:00:00.000Z') / 1000
  );
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  assert.ok(!h.files().includes('pending-pr-verify-old.json'));
  assert.ok(h.files().includes('pending-pr-verify-recent.json'));
  h.cleanup();
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

test('arguments appended to the lane fail with a pointer to the step that takes them', () => {
  const h = harness({ env: { GITHUB_ACTIONS: 'true' } });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify', '--retries=0'], h.deps), 1);
  assert.match(h.output.error[0], /pnpm pr:verify takes no arguments/u);
  assert.match(h.output.error.join('\n'), /e2e:smoke --retries=0/u);
  h.cleanup();
});

test('without a repository the run is a pre-check; an untrusted marker refuses', () => {
  const noRepository = () => {
    throw new Error('not a repository');
  };
  for (const [marker, expected] of [
    [undefined, 0],
    [trusted(), 0],
    [{ status: 'invalid', errors: ['marker file must be owned by root'] }, 1],
  ]) {
    const h = harness({ marker });
    h.deps.exec = noRepository;
    assert.equal(runVerifyMachine(['begin', 'security-guard'], h.deps), expected);
    assert.equal(runVerifyMachine(['stamp', 'security-guard'], h.deps), expected);
    assert.deepEqual(h.files(), []);
    h.cleanup();
  }
  const h = harness();
  assert.equal(runVerifyMachine(['begin', 'security-guard'], h.deps), 0);
  h.deps.gitState = noRepository;
  assert.equal(runVerifyMachine(['stamp', 'security-guard'], h.deps), 0);
  assert.equal(h.readFinal().mode, 'PRE-CHECK');
  h.cleanup();
});
