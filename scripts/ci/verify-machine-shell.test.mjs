// How `stamp` finds its run: only through this shell's pending records of the lane.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { harness, HEAD, trusted } from './verify-machine-harness.mjs';
import { pruneStalePending, shellEnded, shellPendingRecords } from './verify-machine-pending.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

const SHELL = { pid: 4242, start: 'Thu Nov 19 10:00:00 2026' };
const v2 = (fields = {}) => ({ version: 2, lane: 'pr-verify', shellPid: 4242, ...fields });

function memoryFs(files, { vanishOnce = [] } = {}) {
  const vanished = new Set();
  return {
    readdirSync: () => Object.keys(files),
    readFileSync: name => {
      const base = path.basename(name);
      if (vanishOnce.includes(base) && !vanished.has(base)) {
        vanished.add(base);
        throw Object.assign(new Error('gone'), { code: 'ENOENT' });
      }
      if (files[base] instanceof Error) throw files[base];
      return files[base];
    },
  };
}

test('the lookup matches PID and start time, and fails closed on anything it cannot read', () => {
  const lookup = (files, options) =>
    shellPendingRecords('/r', 'pr-verify', SHELL, memoryFs(files, options)).map(m =>
      path.basename(m.path)
    );
  const json = value => JSON.stringify(value);
  assert.deepEqual(
    lookup({
      'pending-pr-verify-a.json': json(v2({ shellStart: SHELL.start })),
      'pending-pr-verify-b.json': json(v2({ shellStart: 'Wed Nov 18 09:00:00 2026' })),
      'pending-pr-verify-c.json': json(v2({ shellStart: null })),
      'pending-pr-verify-d.json': json(v2({ shellPid: 5151, shellStart: SHELL.start })),
      'pending-pr-verify-e.json': json({ lane: 'pr-verify' }),
      'pending-pr-verify-f.json': json({ lane: 'pr-verify', shellPid: 5151 }),
      'pending-security-guard-g.json': json(v2({ shellStart: SHELL.start })),
    }),
    ['pending-pr-verify-a.json', 'pending-pr-verify-c.json', 'pending-pr-verify-e.json']
  );
  const missing = {
    readdirSync: () => {
      throw Object.assign(new Error('none'), { code: 'ENOENT' });
    },
  };
  assert.deepEqual(shellPendingRecords('/r', 'pr-verify', SHELL, missing), []);
  const unknownStart = { ...SHELL, start: null };
  const one = { 'pending-pr-verify-a.json': json(v2({ shellStart: 'any' })) };
  assert.equal(shellPendingRecords('/r', 'pr-verify', unknownStart, memoryFs(one)).length, 1);
  // A record finished between listing and reading starts the scan again, at most three times.
  assert.deepEqual(lookup(one, { vanishOnce: ['pending-pr-verify-a.json'] }), []);
  const always = {
    readdirSync: () => ['pending-pr-verify-x.json'],
    readFileSync: () => {
      throw Object.assign(new Error('gone'), { code: 'ENOENT' });
    },
  };
  assert.throws(() => shellPendingRecords('/r', 'pr-verify', SHELL, always), { code: 'EAGAIN' });
  assert.throws(() => lookup({ 'pending-pr-verify-a.json': '{not json' }), SyntaxError);
  const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
  assert.throws(() => lookup({ 'pending-pr-verify-a.json': denied }), { code: 'EACCES' });
});

function beginTrusted() {
  const h = harness({ marker: trusted() });
  assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
  return h;
}

function withExec(h, outputs) {
  const original = h.deps.exec;
  h.deps.exec = (command, args, cwd) => {
    const key = args.join(' ');
    if (Object.hasOwn(outputs, key)) {
      const value = outputs[key];
      if (value instanceof Error) throw value;
      return value;
    }
    return original(command, args, cwd);
  };
}

test('a begin record of this shell fails the hosted shortcut and every exceptional stamp', () => {
  for (const env of [{ GITHUB_ACTIONS: 'true' }, { EDITOR: 'vi' }]) {
    const h = beginTrusted();
    h.state.git.head = 'd'.repeat(40);
    h.deps.env = { ...h.deps.env, ...env };
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
    assert.match(h.output.error.join('\n'), /a begin record of this shell cannot be checked/u);
    assert.ok(h.files().every(name => name.startsWith('pending-')));
    h.cleanup();
  }
});

test('a begin in another checkout, or no repository at stamp, fails the stamp', () => {
  const moved = beginTrusted();
  withExec(moved, { 'rev-parse --show-toplevel': '/other-checkout' });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], moved.deps), 1);
  assert.match(moved.output.error.join('\n'), /cannot be matched to this checkout/u);
  moved.cleanup();

  const gone = beginTrusted();
  withExec(gone, { 'rev-parse --show-toplevel': new Error('not a repository') });
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], gone.deps), 1);
  assert.match(gone.output.error.join('\n'), /has no git repository here/u);
  gone.cleanup();
});

test('two records of this shell, or one from an older verifier, are never published', () => {
  const twice = beginTrusted();
  const [first] = twice.files();
  const copy = readFileSync(path.join(twice.directory, first), 'utf8');
  writeFileSync(path.join(twice.directory, 'pending-pr-verify-copy.json'), copy);
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], twice.deps), 1);
  assert.match(twice.output.error.join('\n'), /cannot be matched to this checkout/u);
  twice.cleanup();

  const legacy = beginTrusted();
  const [name] = legacy.files();
  const record = JSON.parse(readFileSync(path.join(legacy.directory, name), 'utf8'));
  delete record.version;
  writeFileSync(path.join(legacy.directory, name), JSON.stringify(record));
  assert.equal(runVerifyMachine(['stamp', 'pr-verify'], legacy.deps), 1);
  assert.match(legacy.output.error.join('\n'), /began under an older verifier; rerun the lane/u);
  legacy.cleanup();
});

test('an unreadable HEAD fails the stamp in either mode', () => {
  for (const marker of [undefined, trusted()]) {
    const h = harness({ marker });
    assert.equal(runVerifyMachine(['begin', 'pr-verify'], h.deps), 0);
    withExec(h, { 'rev-parse HEAD': new Error('broken repository') });
    assert.equal(runVerifyMachine(['stamp', 'pr-verify'], h.deps), 1);
    assert.match(h.output.error.join('\n'), /HEAD could not be read; not stamped/u);
    assert.ok(h.files().every(file => file.startsWith('pending-')));
    h.cleanup();
  }
  assert.equal(HEAD.length, 40);
});

test('pruning removes a day-old record only when its shell has ended', () => {
  const kill = code => () => {
    if (code) throw Object.assign(new Error(code), { code });
  };
  const record = v2({ shellStart: SHELL.start });
  assert.equal(shellEnded(record, { kill: kill('ESRCH') }), true);
  assert.equal(shellEnded(record, { kill: kill('EPERM') }), false);
  assert.equal(shellEnded(record, { kill: kill(null), startOf: () => SHELL.start }), false);
  assert.equal(shellEnded(record, { kill: kill(null), startOf: () => 'later' }), true);
  assert.equal(shellEnded(record, { kill: kill(null), startOf: () => null }), false);
  assert.equal(
    shellEnded(v2({ shellStart: null }), { kill: kill(null), startOf: () => 'x' }),
    false
  );
  assert.equal(shellEnded({ lane: 'pr-verify' }), true, 'a legacy record names no shell');

  const removed = [];
  const day = 24 * 60 * 60 * 1000;
  const files = { 'pending-pr-verify-old.json': 1, 'pending-pr-verify-new.json': day + 1 };
  const fs = {
    readdirSync: () => Object.keys(files),
    statSync: name => ({ mtimeMs: files[path.basename(name)] }),
    readFileSync: () => JSON.stringify(record),
    rmSync: name => removed.push(path.basename(name)),
  };
  pruneStalePending('/r', day + 2, { fs, ended: () => false });
  assert.deepEqual(removed, []);
  pruneStalePending('/r', day + 2, { fs, ended: () => true });
  assert.deepEqual(removed, ['pending-pr-verify-old.json']);
});
