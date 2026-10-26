import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';

// Explicit sequencing doubles only: no SQL, real worker, native handle or admission is claimed.
async function fixture(failure) {
  const key = 'm4-pairing-unit-' + randomUUID(),
    calls = [];
  let finish, refuse;
  const joined = new Promise((resolve, reject) => {
    finish = resolve;
    refuse = reject;
  });
  joined.catch(() => {});
  const state = {
    start(root, event) {
      calls.push('start');
      state.event = event;
      return {};
    },
    runtime() {
      calls.push('runtime');
      if (failure === 'runtime') throw Error('runtime failed');
      return {};
    },
    wait() {
      calls.push('wait');
      return joined;
    },
    async native(root, event, handle) {
      calls.push('native');
      assert.equal(event, state.event);
      assert.ok(handle);
      if (failure === 'native') throw Error('native failed');
      return {};
    },
    async close() {
      calls.push('close');
    },
  };
  globalThis[key] = state;
  const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const value = `globalThis[${JSON.stringify(key)}]`;
  const modules = {
    'db-access-m4-runtime.mjs': `export const runM4Runtime=${value}.runtime;export const hasM4RuntimeBinding=()=>false;`,
    'db-access-m4-native-session.mjs': `export const evaluateM4NativeSession=${value}.native;export const assertM4NativeSessionEvent=()=>{throw Error('not part of this unit test')};`,
    'db-access-m4-prior-preparation.mjs': `export const startM4PriorPreparation=${value}.start;export const waitM4PriorPreparation=${value}.wait;export const closeM4PriorPreparation=${value}.close;`,
  };
  let source = fs.readFileSync(
    new URL('./db-access-m4-runtime-pairing.mjs', import.meta.url),
    'utf8'
  );
  for (const [name, text] of Object.entries(modules)) {
    const before = "'./" + name + "'";
    assert.equal(source.split(before).length, 2);
    source = source.replace(before, () => JSON.stringify(data(text)));
  }
  source = source.replace(
    /from '\.\/([^']+)'/gu,
    (_, name) => `from '${new URL(name, import.meta.url).href}'`
  );
  const api = await import(data(source + '\n//# sourceURL=' + key + '.mjs'));
  return {
    api,
    calls,
    finish,
    refuse,
    input: {
      candidate: '/unit-fixture',
      gitDir: '/unit-fixture/.git',
      context: { id: 'event' },
      policy: PROVIDER_UNIT_POLICY,
    },
    cleanup() {
      delete globalThis[key];
    },
  };
}

test('unit sequencing doubles: historical worker joins before native starts and closes after', async () => {
  const f = await fixture();
  try {
    const result = f.api.executeM4Pairing(f.input);
    assert.deepEqual(f.calls, ['start', 'runtime', 'wait']);
    await Promise.resolve();
    assert.ok(!f.calls.includes('native'));
    f.finish();
    const handle = await result;
    assert.deepEqual(f.calls, ['start', 'runtime', 'wait', 'native', 'close']);
    assert.ok(Object.isFrozen(handle));
  } finally {
    f.cleanup();
  }
});
for (const failure of ['runtime', 'wait', 'native'])
  test(`unit sequencing doubles: ${failure} failure closes the historical worker`, async () => {
    const f = await fixture(failure);
    try {
      const result = f.api.executeM4Pairing(f.input);
      if (failure === 'wait') f.refuse(Error('wait failed'));
      else f.finish();
      await assert.rejects(result, new RegExp(failure + ' failed', 'u'));
      assert.equal(f.calls.at(-1), 'close');
      assert.equal(f.calls.filter(value => value === 'close').length, 1);
      if (failure !== 'native') assert.ok(!f.calls.includes('native'));
    } finally {
      f.cleanup();
    }
  });
test('unit sequencing doubles: foreign policy is refused before starting any worker', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.api.executeM4Pairing({ ...f.input, policy: {} }), /foreign policy/u);
    assert.deepEqual(f.calls, []);
  } finally {
    f.cleanup();
  }
});
