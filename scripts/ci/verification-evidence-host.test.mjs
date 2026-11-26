import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

const BASE_NAME = '.interdomestik-gate-signatures';
const isMac = process.platform === 'darwin';

function temporaryHome(t) {
  const home = mkdtempSync(path.join(os.tmpdir(), 'verification-home-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

function createTestSignatureDirectory(home) {
  return isMac ? createSignatureDirectory(home) : createSignatureDirectory(home, () => '[]');
}

function aclTarget(t, location) {
  const home = temporaryHome(t);
  if (location === 'home') return { home, target: home };
  const target = path.join(home, BASE_NAME);
  mkdirSync(target, { mode: 0o700 });
  return { home, target };
}

test('signature verification creates private directories under the account home', t => {
  const home = temporaryHome(t);
  const directory = createTestSignatureDirectory(home);
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
  const base = path.join(home, BASE_NAME);
  mkdirSync(base, { mode: 0o700 });

  for (const mode of [0o770, 0o702, 0o755]) {
    chmodSync(base, mode);
    assert.throws(() => createTestSignatureDirectory(home), { message: 'signature-directory' });
    assert.deepEqual(readdirSync(base), []);
  }
});

test('signature verification refuses a symlink as its base', t => {
  const home = temporaryHome(t);
  const target = temporaryHome(t);
  symlinkSync(target, path.join(home, BASE_NAME));

  assert.throws(() => createTestSignatureDirectory(home), { message: 'signature-directory' });
  assert.deepEqual(readdirSync(target), []);
});

test('signature verification accepts a parsed deny-only ACL', t => {
  const home = temporaryHome(t);
  const directory = createSignatureDirectory(home, () => '[2]');
  assert.equal(path.dirname(directory), path.join(home, BASE_NAME));
});

for (const [location, errorCode] of [
  ['home', 'signature-home'],
  ['base', 'signature-directory'],
]) {
  test(`signature verification refuses a parsed ACL grant on the ${location}`, t => {
    const { home, target } = aclTarget(t, location);
    const readAcl = directory => (directory === target ? '[2, 1]' : '[]');
    assert.throws(() => createSignatureDirectory(home, readAcl), {
      message: `${errorCode}-acl-grant`,
    });
    assert.deepEqual(readdirSync(target), []);
  });

  test(`signature verification refuses an unreadable ACL on the ${location}`, t => {
    const { home, target } = aclTarget(t, location);
    for (const readTarget of [
      () => '',
      () => '[0]',
      () => {
        throw new Error('ACL read failed');
      },
    ]) {
      const readAcl = directory => (directory === target ? readTarget() : '[]');
      assert.throws(() => createSignatureDirectory(home, readAcl), {
        message: `${errorCode}-acl-unreadable`,
      });
    }
    assert.deepEqual(readdirSync(target), []);
  });

  test(
    `signature verification refuses a 0700 ${location} with a macOS ACL grant`,
    { skip: !isMac && 'This platform cannot set macOS extended ACLs' },
    t => {
      const { home, target } = aclTarget(t, location);
      try {
        execFileSync(
          '/bin/chmod',
          ['+a', 'everyone allow search,list,add_file,delete_child', target],
          {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
      } catch (error) {
        if (/operation not supported/iu.test(error.stderr ?? '')) {
          t.skip('The temporary filesystem does not support macOS extended ACLs');
          return;
        }
        throw error;
      }
      assert.equal(statSync(target).mode & 0o777, 0o700);
      assert.throws(() => createSignatureDirectory(home), { message: `${errorCode}-acl-grant` });
      assert.deepEqual(readdirSync(target), []);
    }
  );
}
