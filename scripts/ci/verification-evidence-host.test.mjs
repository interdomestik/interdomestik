import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createSignatureDirectory } from './verification-evidence/host.mjs';

function temporaryHome(t) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'verification-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

test('signature verification creates private directories under the account home', t => {
  const home = temporaryHome(t);
  const directory = createSignatureDirectory(home);
  const base = path.dirname(directory);

  assert.equal(path.dirname(base), home);
  for (const candidate of [base, directory]) {
    const stat = statSync(candidate);
    assert.equal(stat.uid, process.getuid());
    assert.equal(stat.mode & 0o777, 0o700);
  }
});

test('signature verification refuses a base accessible to group or others', t => {
  const home = temporaryHome(t);
  const base = path.join(home, '.interdomestik-gate-signatures');
  mkdirSync(base, { mode: 0o700 });

  for (const mode of [0o770, 0o702, 0o755]) {
    chmodSync(base, mode);
    assert.throws(() => createSignatureDirectory(home), /signature-directory/u);
    assert.deepEqual(readdirSync(base), []);
  }
});

test('signature verification refuses a symlink as its base', t => {
  const home = temporaryHome(t);
  const target = temporaryHome(t);
  symlinkSync(target, path.join(home, '.interdomestik-gate-signatures'));

  assert.throws(() => createSignatureDirectory(home), /signature-directory/u);
  assert.deepEqual(readdirSync(target), []);
});
