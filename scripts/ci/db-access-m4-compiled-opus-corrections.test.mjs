import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readPinned, census } from './m4-compiled-fixture/project/image-custody.mjs';
import {
  assertFreshBrowserOutput,
  browserRowsComplete,
} from './m4-compiled-fixture/project/browser-output.mjs';
import { assertBuiltActionSurface } from './m4-compiled-fixture/seal-build.mjs';
import { actionInput } from './m4-compiled-fixture/project/app/action-input.js';
const hash = data => createHash('sha256').update(data).digest('hex');
function temporary(fn) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'm4-opus-check-')));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
test('single-descriptor pinned manifest rejects foreign digest and oversized input', () =>
  temporary(dir => {
    const file = path.join(dir, 'image.json'),
      bytes = Buffer.from('{"actionMap":{"exports":{"one":"admin"}}}');
    fs.writeFileSync(file, bytes);
    assert.deepEqual(readPinned(file, hash(bytes), 100), JSON.parse(bytes));
    assert.throws(() => readPinned(file, '0'.repeat(64), 100));
    assert.throws(() => readPinned(file, hash(bytes), 4));
    fs.symlinkSync(file, path.join(dir, 'link'));
    assert.throws(() => readPinned(path.join(dir, 'link'), hash(bytes), 100));
  }));
test('a pathname replacement during a descriptor read cannot substitute parsed map bytes', () =>
  temporary(dir => {
    const file = path.join(dir, 'image.json'),
      old = Buffer.from('{"actionMap":{"id":"old"}}'),
      fake = Buffer.from('{"actionMap":{"id":"evil"}}');
    fs.writeFileSync(file, old);
    const original = fs.readSync;
    let swapped = false;
    fs.readSync = (...args) => {
      if (!swapped) {
        swapped = true;
        fs.renameSync(file, file + '.old');
        fs.writeFileSync(file, fake);
      }
      return original(...args);
    };
    try {
      try {
        assert.equal(readPinned(file, hash(old), 100).actionMap.id, 'old');
      } catch (error) {
        assert.match(error.message, /changed|pinned/u);
      }
      assert.equal(swapped, true);
    } finally {
      fs.readSync = original;
    }
  }));
test('mutable cache is a physical directory, never a symlink or plain file', () =>
  temporary(dir => {
    fs.mkdirSync(path.join(dir, '.next'));
    fs.mkdirSync(path.join(dir, '.next/cache'));
    assert.deepEqual(census(dir), {});
    fs.rmSync(path.join(dir, '.next/cache'), { recursive: true });
    fs.symlinkSync(dir, path.join(dir, '.next/cache'));
    assert.throws(() => census(dir), /cache path/);
    fs.rmSync(path.join(dir, '.next/cache'));
    fs.writeFileSync(path.join(dir, '.next/cache'), 'x');
    assert.throws(() => census(dir), /cache path/);
  }));
test('action surface requires exactly the three named node actions, zero edge and 2mb', () => {
  const actions = {
    exports: {
      a: 'runAdminAssignment',
      b: 'runAgentAssignment',
      c: 'runStaffAssignment',
    },
  };
  const manifest = {
    node: {
      a: { workers: { x: 1 } },
      b: { workers: { x: 1 } },
      c: { workers: { x: 1 } },
    },
    edge: {},
  };
  const required = {
    config: { experimental: { serverActions: { bodySizeLimit: '2mb' } } },
  };
  assert.doesNotThrow(() => assertBuiltActionSurface(actions, manifest, required));
  for (const mutate of [
    x => (x.manifest.node.foreign = { workers: { x: 1 } }),
    x => (x.manifest.edge.foreign = {}),
    x => delete x.manifest.edge,
    x => (x.required.config.experimental.serverActions.bodySizeLimit = '1mb'),
    x => delete x.manifest.node.a,
    x => (x.actions.exports.c = 'runAdminAssignment'),
  ]) {
    const value = structuredClone({ actions, manifest, required });
    mutate(value);
    assert.throws(() => assertBuiltActionSurface(value.actions, value.manifest, value.required));
  }
});
test('fresh browser output checks owned physical 0700 and refuses existing contents', () =>
  temporary(dir => {
    assert.equal(assertFreshBrowserOutput(dir), dir);
    fs.writeFileSync(path.join(dir, 'old'), 'x');
    assert.throws(() => assertFreshBrowserOutput(dir));
    fs.rmSync(path.join(dir, 'old'));
    fs.chmodSync(dir, 0o755);
    assert.throws(() => assertFreshBrowserOutput(dir));
  }));
test('complete browser record requires three ordered rows plus distinct denial', () => {
  const rows = ['legacy-admin', 'legacy-agent', 'staff'].map((profile, i) => ({
    profile,
    operationId: 'id' + i,
    frameworkActionId: 'action',
  }));
  const denial = {
    profile: 'legacy-admin',
    operationId: 'id3',
    frameworkActionId: 'action',
  };
  assert.equal(browserRowsComplete(rows, denial), true);
  assert.equal(browserRowsComplete(rows.slice(0, 2), denial), false);
  assert.equal(browserRowsComplete(rows, null), false);
  assert.equal(browserRowsComplete(rows, { ...denial, operationId: 'id0' }), false);
  assert.equal(browserRowsComplete([...rows].reverse(), denial), false);
});
test('form value requires a string, preserving explicit clear and staff omission', () => {
  const form = new FormData();
  form.set('claimId', 'claim');
  form.set('operationId', '11111111-1111-4111-8111-111111111111');
  form.set('targetMode', 'value');
  assert.equal(actionInput(form, false), null);
  form.set('staffId', 'staff');
  assert.equal(actionInput(form, false).staffId, 'staff');
  form.set('targetMode', 'clear');
  assert.equal(actionInput(form, false).staffId, null);
  form.delete('staffId');
  form.set('targetMode', 'omitted');
  assert.equal(Object.hasOwn(actionInput(form, true), 'staffId'), false);
  assert.equal(actionInput(form, false), null);
});
