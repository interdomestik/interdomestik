import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import test from 'node:test';
import {
  authenticateRuntimeContext,
  exact,
  hash,
  safeEnv,
  snapshot,
} from './db-access-provider-runtime-identity.mjs';

const nativeExec = cp.execFileSync;
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-snapshot-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (...args) =>
    nativeExec('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], {
      env: safeEnv,
    });
  run('init', '--initial-branch=main');
  const content = Buffer.from([0, 10, 255, 13, 0, 20]);
  const records = {};
  for (const [file, bytes, mode] of [
    ['binary.bin', content, 0o644],
    ['nested/runner.mjs', Buffer.from('export const value = "é";\n'), 0o755],
    ['same.bin', content, 0o644],
    ['empty.bin', Buffer.alloc(0), 0o644],
  ]) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, bytes, { mode });
    records[file] = {
      mode: mode & 0o111 ? '100755' : '100644',
      bytes: bytes.length,
      sha256: hash(bytes),
    };
  }
  run('add', '.');
  run(
    '-c',
    'user.name=Snapshot fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--no-gpg-sign',
    '-m',
    'fixture'
  );
  const commit = run('rev-parse', 'HEAD').toString().trim();
  const tree = run('rev-parse', 'HEAD^{tree}').toString().trim();
  run('update-ref', 'refs/protected/main', commit);
  const gitDir = path.join(root, '.git');
  const context = {
    version: 1,
    repository: 'interdomestik/interdomestik',
    eventName: 'push',
    baseCommit: commit,
    headCommit: commit,
    candidateCommit: commit,
    candidateTree: tree,
    sourceCommit: commit,
    sourceTree: tree,
    protectedMain: commit,
  };
  const git = authenticateRuntimeContext(gitDir, context);
  git.readBlob = oid =>
    nativeExec(
      '/usr/bin/git',
      ['--no-replace-objects', '--git-dir', gitDir, 'cat-file', 'blob', oid],
      { env: safeEnv }
    );
  return { root, records, commit, git, run };
}

// Exact pre-change implementation: independent parity oracle for the fixed digest.
function legacySnapshot(root, commit, records, git) {
  const identities = {};
  for (const [file, expected] of Object.entries(records)) {
    const bytes = exact(root, file, expected);
    const item = git(['ls-tree', commit, '--', file]);
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(item);
    if (
      !match ||
      match[1] !== expected.mode ||
      match[3] !== file ||
      hash(git.readBlob(match[2])) !== hash(bytes)
    )
      throw Error('legacy checkout/tree mismatch');
    identities[file] = hash(bytes);
  }
  return hash(JSON.stringify(identities));
}

test('binary, empty, executable and shared blobs retain exact legacy digest with two Git reads per snapshot', t => {
  const f = fixture(t);
  const expected = legacySnapshot(f.root, f.commit, f.records, f.git);
  const reads = [];
  cp.execFileSync = (command, args, options) => {
    if (command === '/usr/bin/git') reads.push(args);
    return nativeExec(command, args, options);
  };
  syncBuiltinESMExports();
  try {
    assert.equal(snapshot(f.root, f.commit, f.records, f.git), expected);
    assert.equal(reads.length, 2);
    assert.equal(reads.filter(args => args.includes('ls-tree')).length, 1);
    assert(reads.find(args => args.includes('ls-tree')).includes('--literal-pathspecs'));
    assert(reads.find(args => args.includes('ls-tree')).includes('-rz'));
    assert.equal(reads.filter(args => args.includes('--batch')).length, 1);
    reads.length = 0;
    assert.equal(snapshot(f.root, f.commit, f.records, f.git), expected);
    assert.equal(reads.length, 2, 'Every bookend rereads Git; no cross-call cache');
  } finally {
    cp.execFileSync = nativeExec;
    syncBuiltinESMExports();
  }
});

test('record iteration order stays part of the original snapshot digest', t => {
  const f = fixture(t);
  for (const records of [f.records, Object.fromEntries(Object.entries(f.records).reverse())])
    assert.equal(
      snapshot(f.root, f.commit, records, f.git),
      legacySnapshot(f.root, f.commit, records, f.git)
    );
  assert.notEqual(
    snapshot(f.root, f.commit, f.records, f.git),
    snapshot(f.root, f.commit, Object.fromEntries(Object.entries(f.records).reverse()), f.git)
  );
});

test('writable reader properties cannot replace authenticated Git blob readback', t => {
  const f = fixture(t);
  const expected = legacySnapshot(f.root, f.commit, f.records, f.git);
  f.git.readBlob = () => {
    throw Error('foreign reader must not execute');
  };
  f.git.readBlobs = () => {
    throw Error('foreign batch must not execute');
  };
  assert.equal(snapshot(f.root, f.commit, f.records, f.git), expected);
});

test('a wrapper or fabricated Git function has no authenticated snapshot capability', t => {
  const f = fixture(t);
  const fake = args => f.git(args);
  fake.readBlob = f.git.readBlob;
  assert.throws(
    () => snapshot(f.root, f.commit, f.records, fake),
    /unauthenticated Git snapshot reader/u
  );
});

test('an authenticated reader cannot snapshot a commit outside its bound event', t => {
  const f = fixture(t);
  assert.throws(
    () => snapshot(f.root, '0'.repeat(40), f.records, f.git),
    /unauthenticated Git snapshot reader/u
  );
});

test('raw Git content remains mandatory even when filesystem descriptors are freshly valid', t => {
  const f = fixture(t);
  const bytes = Buffer.from('changed and freshly described');
  fs.writeFileSync(path.join(f.root, 'binary.bin'), bytes);
  const records = {
    ...f.records,
    'binary.bin': { mode: '100644', bytes: bytes.length, sha256: hash(bytes) },
  };
  assert.throws(() => snapshot(f.root, f.commit, records, f.git), /checkout\/tree mismatch/u);
});

test('Git mode, missing file and symlink refusals remain independent of matching content', t => {
  for (const change of ['mode', 'missing', 'symlink']) {
    const f = fixture(t);
    const full = path.join(f.root, 'binary.bin');
    const records = structuredClone(f.records);
    if (change === 'mode') {
      fs.chmodSync(full, 0o755);
      records['binary.bin'].mode = '100755';
    }
    if (change === 'missing') fs.rmSync(full);
    if (change === 'symlink') {
      fs.rmSync(full);
      fs.symlinkSync(path.join(f.root, 'same.bin'), full);
    }
    assert.throws(() => snapshot(f.root, f.commit, records, f.git));
  }
});

for (const fault of ['missing', 'duplicate', 'unexpected', 'kind', 'terminator', 'empty row'])
  test('malformed tree metadata refuses: ' + fault, t => {
    const f = fixture(t);
    cp.execFileSync = (command, args, options) => {
      const output = nativeExec(command, args, options);
      if (command !== '/usr/bin/git' || !args.includes('ls-tree')) return output;
      const rows = output.toString('utf8').split('\0');
      rows.pop();
      if (fault === 'missing') rows.shift();
      if (fault === 'duplicate') rows.push(rows[0]);
      if (fault === 'unexpected') rows.push('100644 blob ' + 'a'.repeat(40) + '\tunexpected.bin');
      if (fault === 'kind') rows[0] = rows[0].replace(' blob ', ' tree ');
      if (fault === 'empty row') rows.push('');
      return Buffer.from(rows.join('\0') + (fault === 'terminator' ? '' : '\0'));
    };
    syncBuiltinESMExports();
    try {
      assert.throws(() => snapshot(f.root, f.commit, f.records, f.git), /checkout\/tree mismatch/u);
    } finally {
      cp.execFileSync = nativeExec;
      syncBuiltinESMExports();
    }
  });
