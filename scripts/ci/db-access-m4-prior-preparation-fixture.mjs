import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { ADOPTION } from './db-access-adoption.mjs';
import { outputShape } from './db-access-output-binding.mjs';
import { PRIOR_MESSAGE, trustedDigest } from './db-access-m4-prior-source.mjs';

// Explicit unit doubles for lifecycle/interleavings only. No Git/SQL/native admission claim.
// Production has no injection seam: only the test's in-memory module rewrites imports.
export async function priorFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(os.tmpdir() + '/m4-prior-unit-'));
  const key = 'm4-prior-test-' + randomUUID();
  const state = {
    workers: [],
    generation: 0,
    serialCalls: 0,
    loaderSeals: 0,
    loaderReleases: 0,
    loaderCompletions: 0,
  };
  const controls = {
    analysisUnknown: ['first', 'second'],
    statusReturnPriorRow: { identity: 'old-status' },
    claimHistoryPriorRow: undefined,
    priorScoped: ['a.ts', 'b.ts'],
  };
  const binding = (repo, event) =>
    outputShape({ repo, event, generation: state.generation }).digest;
  class Worker extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.terminations = 0;
      this.once('exit', code => {
        this.exitCode = code;
      });
      state.workers.push(this);
    }
    async terminate() {
      this.terminations++;
      if (this.exitCode === undefined) this.emit('exit', 1);
      return this.exitCode;
    }
  }
  const realSource = new URL('./db-access-m4-prior-source.mjs', import.meta.url).href;
  const realWorker = new URL('./db-access-m4-prior-worker.mjs', import.meta.url).href;
  const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  state.Worker = Worker;
  state.binding = binding;
  state.compute = () => {
    state.serialCalls++;
    return structuredClone(controls);
  };
  globalThis[key] = state;
  const fakeSource = data(
    `export {trustedDigest,priorEvent,validatePriorMessage,priorFailure} from '${realSource}'; export const currentPriorBinding=globalThis[${JSON.stringify(key)}].binding;`
  );
  const fakeCompute = data(
    `export const computePriorControls=globalThis[${JSON.stringify(key)}].compute;`
  );
  const fakeLoader = data(`
const state=globalThis[${JSON.stringify(key)}];
const launches=new WeakMap();
export function launchM4PriorWorker(session,{repoRoot,event,binding}){
  if(!session) throw Error('missing loader session');
  const nonce='unit-nonce-'+state.workers.length;
  const worker=new state.Worker(
    ${JSON.stringify(realWorker)},
    {workerData:{repoRoot,event,nonce},env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:3072}}
  );
  const handle=Object.freeze({});
  launches.set(handle,{worker,nonce,binding});
  return handle;
}
const owned=handle=>{const value=launches.get(handle);if(!value)throw Error('foreign launch');return value};
export const workerForM4LoaderLaunch=handle=>owned(handle).worker;
export const bindingForM4LoaderLaunch=handle=>{const value=owned(handle);return {nonce:value.nonce,binding:value.binding}};
export const isM4LoaderControlMessage=()=>false;
export const sealM4WorkerLoads=()=>{state.loaderSeals++;};
export const releaseM4PriorWorker=()=>{state.loaderReleases++;};
export const completeM4WorkerLoaderLaunch=(handle,code)=>{if(code!==0)throw Error('nonzero');owned(handle);state.loaderCompletions++;};
`);
  let text = fs.readFileSync(
    new URL('./db-access-m4-prior-preparation.mjs', import.meta.url),
    'utf8'
  );
  for (const [from, to] of [
    ["'./db-access-m4-prior-source.mjs'", JSON.stringify(fakeSource)],
    ["'./db-access-prior-controls.mjs'", JSON.stringify(fakeCompute)],
    ["'./db-access-m4-worker-loader-authority.mjs'", JSON.stringify(fakeLoader)],
  ]) {
    assert.equal(text.split(from).length, 2, from);
    text = text.replace(from, () => to);
  }
  text = text.replace(
    /from '\.\/([^']+)'/gu,
    (_, name) => `from '${new URL(name, import.meta.url).href}'`
  );
  const api = await import(data(text + '\n//# sourceURL=' + key + '.mjs'));
  const event = { gitDir: root, context: { id: 'fixed-event' } };
  const trusted = new Map([['a.ts', 'original historical text']]);
  const prepared = () => ({ repoRoot: root, adoption: ADOPTION, trusted, model: {} });
  const start = () => {
    const handle = api.startM4PriorPreparation(root, event, Object.freeze({ unit: true }));
    const worker = state.workers.at(-1);
    const message = () => ({
      type: PRIOR_MESSAGE,
      nonce: worker.options.workerData.nonce,
      binding: binding(root, event),
      snapshotDigest: trustedDigest(trusted),
      controlsDigest: outputShape(controls).digest,
      controls: structuredClone(controls),
    });
    return { handle, worker, message };
  };
  return {
    api,
    state,
    root,
    event,
    trusted,
    prepared,
    controls,
    start,
    async finish(item) {
      item.worker.emit('message', item.message());
      await Promise.resolve();
      item.worker.emit('exit', 0);
      await api.waitM4PriorPreparation(item.handle);
    },
    async cleanup() {
      for (const worker of state.workers)
        if (worker.exitCode === undefined) await worker.terminate();
      delete globalThis[key];
      fs.rmSync(root, { recursive: true });
    },
  };
}
