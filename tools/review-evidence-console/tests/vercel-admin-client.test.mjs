import assert from 'node:assert/strict';
import test from 'node:test';

import { PINS, applyRegistry, invokeVercel } from '../server/admin/vercel-client.mjs';

test('Vercel target pins are immutable and preview-only', () => {
  assert.deepEqual(PINS, {
    teamId: 'team_zZnOjQLylAZArqxcUhLbHDHc',
    projectId: 'prj_Yn7w7tQEAJYaALs2gL2FR9UWgHCc',
    projectName: 'interdomestik-reviewer-portal', environment: 'preview',
  });
  assert.equal(Object.isFrozen(PINS), true);
});

test('invokes Vercel directly without a shell and hands secrets over stdin', async () => {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return fakeChild(0);
  };
  await invokeVercel(['env', 'add'], { stdin: 'private-value', spawnImpl });
  assert.equal(calls[0].command, 'vercel');
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].args.includes('private-value'), false);
});

test('rejects stale state and verifies the post-write fingerprint', async () => {
  const snapshots = ['old', 'new'];
  await assert.rejects(() => applyRegistry({
    json: 'new', expectedFingerprint: 'stale', fingerprint: value => value, readRemote: async () => 'old',
  }), /stale/u);
  const result = await applyRegistry({
    json: 'new', expectedFingerprint: 'old', fingerprint: value => value,
    readRemote: async () => snapshots.shift(), compareAndSwap: async () => true,
  });
  assert.equal(result.fingerprint, 'new');
});

test('reports a partial failure when the write succeeds but verification differs', async () => {
  const snapshots = ['old', 'unexpected'];
  await assert.rejects(() => applyRegistry({
    json: 'new', expectedFingerprint: 'old', fingerprint: value => value,
    readRemote: async () => snapshots.shift(), compareAndSwap: async () => true,
  }), /partial/u);
});

test('fails closed without a provider atomic compare-and-swap primitive', async () => {
  await assert.rejects(() => applyRegistry({
    json: 'new', expectedFingerprint: 'old', fingerprint: value => value,
    readRemote: async () => 'old',
  }), /Atomic Vercel CAS/u);
});

function fakeChild(code) {
  const listeners = new Map();
  const stream = { on() {}, write() {}, end() {} };
  queueMicrotask(() => listeners.get('close')?.(code));
  return { stdin: stream, stdout: stream, stderr: stream, on: (event, fn) => listeners.set(event, fn) };
}
