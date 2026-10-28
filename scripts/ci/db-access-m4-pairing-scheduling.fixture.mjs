import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';

// Explicit sequencing doubles only: no SQL, real worker, native handle or admission is claimed.
export async function fixture(failure) {
  const key = 'm4-pairing-unit-' + randomUUID(),
    calls = [];
  let finish, refuse;
  const joined = new Promise((resolve, reject) => {
    finish = resolve;
    refuse = reject;
  });
  joined.catch(() => {});
  const state = {
    privateAcceptance: {
      boundedCompiledConstructionQualified: true,
      compiledConstruction: { scopedConstructionQualified: true },
      construction: {
        kind: 'm4-current-qualification-proof-construction',
        localQualificationOnly: true,
        nextActionIngressQualified: false,
        currentProofClassQualified: true,
        acceptedOldIdentityCount: 0,
      },
      originalFactoryBank: {
        kind: 'current-original-restored-factory-acceptance',
        originalSelectedTrustedCohortAccepted: false,
        accounting: { acceptedOriginalIdentities: ['unit-factory-one', 'unit-factory-two'] },
        decisions: [
          { completeIdentityContextConjunction: true },
          { completeIdentityContextConjunction: true },
        ],
      },
      currentLocalConstructionQualified: true,
      mountedAssignment: {
        localDecisions: ['legacy-admin', 'legacy-agent', 'staff'].map((profile, index) => ({
          profile,
          qualifiedLocalQualificationConstruction: true,
          adapterActuallyExecuted: true,
          wholeOriginalIdentityQualified: false,
          nextDeploymentQualified: false,
          executedRoutes: [
            {
              profile,
              caseId: [
                'mounted-admin-assignment-source-route',
                'mounted-agent-assignment-source-route',
                'mounted-staff-assignment-source-route',
              ][index],
            },
          ],
        })),
      },
      unitDouble: true,
    },
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
    async compiled(input) {
      calls.push('compiled');
      assert.equal(input.databaseUrl, 'postgresql://owned-compiled-unit');
      if (failure === 'compiled') throw Error('compiled failed');
      state.compiledToken = Object.freeze({ unitDouble: true });
      return state.compiledToken;
    },
    compiledTake(token) {
      calls.push('compiled-take');
      assert.equal(token, state.compiledToken);
      if (state.compiledTaken) throw Error('compiled repeated take');
      state.compiledTaken = true;
      return { result: token, imageRecords: { unitDouble: true } };
    },
    bridge() {
      calls.push('compiled-bridge');
      if (failure === 'bridge') throw Error('compiled correspondence failed');
      return { scopedConstructionQualified: true };
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
    'db-access-m4-compiled-producer-loader.mjs': `export const executeM4CompiledRuntime=${value}.compiled;export const takeM4CompiledRuntimeForJoin=${value}.compiledTake;`,
    'db-access-m4-compiled-context-bridge.mjs': `export const linkM4CompiledConstructionContexts=${value}.bridge;`,
    'db-access-m4-p2-ordinary.mjs': `export const runFixedM4P2=async()=>${value}.ordinary();export const takeFixedM4P2ForJoin=${value}.ordinaryTake;`,
    'db-access-m4-private-acceptance-data.mjs': `export const projectFixedPrivateAcceptance=()=>${value}.privateAcceptance;`,
    'db-access-m4-runtime.mjs': `export const runM4Runtime=${value}.runtime;export const hasM4RuntimeBinding=()=>true;`,
    'db-access-m4-native-session.mjs': `export const evaluateM4NativeSession=${value}.native;export const assertM4NativeSessionEvent=()=>{throw Error('not part of this unit test')};`,
    'db-access-m4-prior-preparation.mjs': `export const startM4PriorPreparation=${value}.start;export const waitM4PriorPreparation=${value}.wait;export const closeM4PriorPreparation=${value}.close;`,
    'db-access-m4-worker-loader-authority.mjs': `export const openM4WorkerLoaderSession=${value}.loaderOpen;export const finishM4WorkerLoaderSession=${value}.loaderFinish;export const assertM4WorkerLoaderProofCurrent=${value}.loaderAssert;export const abortM4WorkerLoaderSession=${value}.loaderAbort;`,
    'db-access-m4-context-projection.mjs': `export const describeM4ContextInspection=()=>({context:true});`,
    'db-access-m4-gap-ledger.mjs': `export const describeM4PairGaps=()=>({gaps:true});`,
    'db-access-m4-effect-assertions.mjs': `export const linkM4EffectAssertions=()=>({native:{report:{rows:[]},outputDigest:'native-output',sourcePolicyDigest:'source-policy',eventBinding:{id:'event'},diagnosticToken:${value}.diagnosticToken},effectAssertions:{effects:true},source:{source:true}});`,
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
    privateAcceptance: state.privateAcceptance,
    input: {
      candidate: '/unit-fixture',
      producer: '/unit-producer',
      gitDir: '/unit-fixture/.git',
      compiledDatabaseUrl: 'postgresql://owned-compiled-unit',
      context: { id: 'event' },
      policy: PROVIDER_UNIT_POLICY,
    },
    cleanup() {
      delete globalThis[key];
    },
  };
}
