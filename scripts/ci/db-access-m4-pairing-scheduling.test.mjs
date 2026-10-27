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
    diagnosticToken: Object.freeze({ version: 1, unitDouble: true }),
    ordinary() {
      calls.push('ordinary-run');
      if (failure === 'ordinary') throw Error('ordinary failed');
      state.ordinaryToken = Object.freeze({ unitDouble: true });
      return state.ordinaryToken;
    },
    ordinaryTake(token) {
      calls.push('ordinary-take');
      assert.equal(token, state.ordinaryToken);
      return { unitDouble: true };
    },
    loaderOpen(input) {
      calls.push('loader-open');
      state.loader = Object.freeze({ input });
      return state.loader;
    },
    loaderFinish(loader) {
      calls.push('loader-finish');
      assert.equal(loader, state.loader);
      state.loaderProof = Object.freeze({ proof: true });
      return state.loaderProof;
    },
    loaderAssert(proof) {
      calls.push('loader-assert');
      assert.equal(proof, state.loaderProof);
      return Object.freeze({ scope: 'LOADER_ONLY_LOCAL', workers: 5 });
    },
    async loaderAbort(loader) {
      calls.push('loader-abort');
      assert.equal(loader, state.loader);
    },
    start(root, event, loader) {
      calls.push('start');
      state.event = event;
      assert.equal(loader, state.loader);
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
    async native(root, event, handle, loader) {
      calls.push('native');
      assert.equal(event, state.event);
      assert.ok(handle);
      assert.equal(loader, state.loader);
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
    'db-access-m4-p2-ordinary.mjs': `export const runFixedM4P2=async()=>${value}.ordinary();export const takeFixedM4P2ForJoin=${value}.ordinaryTake;`,
    'db-access-m4-private-acceptance-data.mjs': `export const projectFixedPrivateAcceptance=()=>({decisions:[],unitDouble:true});`,
    'db-access-m4-runtime.mjs': `export const runM4Runtime=${value}.runtime;export const hasM4RuntimeBinding=()=>true;`,
    'db-access-m4-native-session.mjs': `export const evaluateM4NativeSession=${value}.native;export const assertM4NativeSessionEvent=()=>{throw Error('not part of this unit test')};`,
    'db-access-m4-prior-preparation.mjs': `export const startM4PriorPreparation=${value}.start;export const waitM4PriorPreparation=${value}.wait;export const closeM4PriorPreparation=${value}.close;`,
    'db-access-m4-worker-loader-authority.mjs': `export const openM4WorkerLoaderSession=${value}.loaderOpen;export const finishM4WorkerLoaderSession=${value}.loaderFinish;export const assertM4WorkerLoaderProofCurrent=${value}.loaderAssert;export const abortM4WorkerLoaderSession=${value}.loaderAbort;`,
    'db-access-m4-context-projection.mjs': `export const describeM4ContextInspection=()=>({context:true});`,
    'db-access-m4-gap-ledger.mjs': `export const describeM4PairGaps=()=>({gaps:true});`,
    'db-access-m4-effect-assertions.mjs': `export const linkM4EffectAssertions=()=>({native:{report:{rows:[]},outputDigest:'native-output',sourcePolicyDigest:'source-policy',eventBinding:{id:'event'},diagnosticToken:${value}.diagnosticToken},effectAssertions:{effects:true}});`,
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
    diagnosticOwner: new WeakMap([[state.diagnosticToken, true]]),
    diagnosticToken: state.diagnosticToken,
    input: {
      candidate: '/unit-fixture',
      producer: '/unit-producer',
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
    assert.deepEqual(f.calls, ['ordinary-run']);
    await Promise.resolve();
    assert.deepEqual(f.calls, ['ordinary-run', 'loader-open', 'start', 'runtime', 'wait']);
    assert.ok(!f.calls.includes('native'));
    f.finish();
    const handle = await result;
    assert.deepEqual(f.calls, [
      'ordinary-run',
      'loader-open',
      'start',
      'runtime',
      'wait',
      'native',
      'loader-finish',
      'close',
    ]);
    assert.ok(Object.isFrozen(handle));
    const projection = f.api.assertM4Pairing(handle, f.input);
    assert.deepEqual(projection.checkpoint.workerLoaderInspection, {
      scope: 'LOADER_ONLY_LOCAL',
      workers: 5,
    });
    assert.equal(f.calls.at(-1), 'ordinary-take');
    assert.equal(f.calls.filter(value => value === 'loader-assert').length, 1);
    assert.equal(f.calls.filter(value => value === 'ordinary-take').length, 1);
    assert.deepEqual(projection.checkpoint.nativeConstructionData.report, { rows: [] });
    assert.equal(projection.checkpoint.nativeConstructionData.sourcePolicyDigest, 'source-policy');
    assert.equal(f.diagnosticOwner.has(f.diagnosticToken), true);
    assert.deepEqual(
      projection.checkpoint.nativeConstructionData.diagnosticToken,
      f.diagnosticToken
    );
    assert.equal(
      f.diagnosticOwner.has(projection.checkpoint.nativeConstructionData.diagnosticToken),
      false
    );
  } finally {
    f.cleanup();
  }
});
test('unit sequencing doubles: ordinary prerequisite failure starts no loader or worker', async () => {
  const f = await fixture('ordinary');
  try {
    await assert.rejects(f.api.executeM4Pairing(f.input), /ordinary failed/u);
    assert.deepEqual(f.calls, ['ordinary-run']);
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
      assert.equal(f.calls.at(-1), 'loader-abort');
      assert.equal(f.calls.filter(value => value === 'close').length, 1);
      assert.equal(f.calls.filter(value => value === 'loader-abort').length, 1);
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
