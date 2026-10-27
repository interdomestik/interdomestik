import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { modeWireFixture } from './db-access-m4-mode-wire.fixture.mjs';
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const moduleText = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const moduleURL = name => new URL(name, import.meta.url).href;
export async function modeFixture() {
  const f = modeWireFixture(),
    key = 'm4-mode-unit-' + randomUUID();
  const state = {
    ...f,
    workers: [],
    sent: [],
    seal: 'unit-producer-seal',
    sourceChanged: false,
    loader: Object.freeze({ unitOnly: true }),
    bound: 0,
    preparedCalls: 0,
    traversalCalls: 0,
    pools: [],
  };
  globalThis[key] = state;
  const ref = 'globalThis[' + JSON.stringify(key) + ']';
  const evidenceURL = data(moduleText('db-access-m4-worker-evidence.mjs'));
  const evidenceShim = data(
    'export const currentM4ProducerSeal=()=>' +
      ref +
      '.seal;export {expectedM4TransportAck} from ' +
      JSON.stringify(evidenceURL) +
      ';'
  );
  const outputURL = moduleURL('db-access-output-binding.mjs');
  const { expectedM4TransportAck: ack } = await import(evidenceURL);
  state.Worker = class extends EventEmitter {
    constructor(url, options) {
      super();
      this.channel = options.workerData.m4ChannelId;
      this.used = false;
      state.workers.push(this);
      queueMicrotask(() =>
        this.emit('message', {
          type: 'READY',
          channelId: this.channel,
          snapshot: state.snapshot,
        })
      );
    }
    postMessage(input) {
      state.sent.push(input);
      if (input.type === 'RUN') {
        this.used = true;
        const result = {
          ...structuredClone(state.results[input.jobId]),
          type: 'RESULT',
          snapshot: input.snapshot,
          jobId: input.jobId,
          ...(input.m4Transport
            ? { m4TransportAck: ack(input.m4Transport, true, input.jobId) }
            : {}),
        };
        state.changeResult?.(result);
        queueMicrotask(() => this.emit('message', result));
      } else {
        const message = {
          type: 'DONE',
          snapshot: input.snapshot,
          ...(input.m4Transport ? { m4Done: ack(input.m4Transport, this.used) } : {}),
        };
        state.changeDone?.(message);
        queueMicrotask(() => {
          this.emit('message', message);
          queueMicrotask(() => this.emit('exit', 0));
        });
      }
    }
    async terminate() {
      this.emit('exit', 1);
      return 1;
    }
  };
  const launches = new WeakMap();
  state.authority = {
    launchM4GraphWorker(session, { index }) {
      if (session !== state.loader) throw Error('unit foreign loader capability');
      const handle = {};
      launches.set(
        handle,
        new state.Worker(null, {
          workerData: { m4ChannelId: 'unit-private-' + index },
        })
      );
      return handle;
    },
    bindingForM4LoaderLaunch(handle) {
      return { binding: launches.get(handle).channel };
    },
    workerForM4LoaderLaunch: handle => launches.get(handle),
    isM4LoaderControlMessage: () => false,
    sealM4WorkerLoads: async () => {},
    noteM4GraphWorkerDone() {},
    completeM4WorkerLoaderLaunch() {},
    bindM4GraphLoaderEvidence(session, proof) {
      assert.equal(session, state.loader);
      state.bound++;
      state.privateProof = proof;
    },
  };
  const authorityURL = data(
    Object.keys(state.authority)
      .map(
        name => 'export const ' + name + '=(...args)=>' + ref + '.authority.' + name + '(...args);'
      )
      .join('\n')
  );
  const nativeProxy = data(
    ['bindM4WorkerRequest', 'consumeM4WorkerRequest', 'assertM4WorkerRequestCurrent']
      .map(name => 'export const ' + name + '=(...args)=>' + ref + '.native.' + name + '(...args);')
      .join('\n')
  );
  function isolate(name, replacements = {}) {
    let code = moduleText(name);
    for (const [specifier, url] of Object.entries(replacements))
      code = code
        .replaceAll(JSON.stringify(specifier), JSON.stringify(url))
        .replaceAll("'" + specifier + "'", JSON.stringify(url));
    code = code.replace(
      /from '\.\/([^']+)'/g,
      (_m, child) => 'from ' + JSON.stringify(moduleURL(child))
    );
    return code;
  }
  let poolCode = isolate('db-access-graph-worker-pool.mjs', {
    'node:worker_threads': data('export const Worker=' + ref + '.Worker;'),
    './db-access-m4-worker-evidence.mjs': evidenceShim,
  });
  poolCode = poolCode
    .replace(
      "new URL('./db-access-m4-native-prerequisite.mjs', import.meta.url)",
      JSON.stringify(nativeProxy)
    )
    .replace(
      "new URL('./db-access-m4-worker-loader-authority.mjs', import.meta.url)",
      JSON.stringify(authorityURL)
    )
    .replace(
      "new URL('./db-access-graph-worker.mjs', import.meta.url)",
      JSON.stringify('file:///explicit-unit-worker.mjs')
    );
  const poolURL = data(poolCode),
    pool = await import(poolURL);
  const trustShim = data(
    'export const candidateSources=()=>new Map(' + ref + '.prepared.model.sources);'
  );
  const graphURL = data(
    isolate('db-access-graph-workers.mjs', {
      './db-access-graph-worker-pool.mjs': poolURL,
      './db-access-m4-native-prerequisite.mjs': nativeProxy,
      './db-access-trust.mjs': trustShim,
    })
  );
  const graph = await import(graphURL);
  state.encode = () => ({
    changed: [...state.prepared.inventory.changed],
    entries: state.prepared.inventory.entries.map(x => ({
      identity: x.identity,
      file: x.file,
    })),
  });
  const encodeShim = data('export const encodeInventory=()=>' + ref + '.encode();');
  const prepareShim = data(
    'export const prepareGuard=(...args)=>{' +
      ref +
      '.prepareArgs=args;' +
      ref +
      '.preparedCalls++;return ' +
      ref +
      '.prepared;};export const prepareGuardModel=()=>{throw Error("not called");};'
  );
  const graphShim = data(
    'export const inspectChangedEdges=()=>{' +
      ref +
      '.traversalCalls++;' +
      ref +
      '.duringSync?.();return ' +
      ref +
      '.syncGraph;};'
  );
  const finalShim = data(
    'export const finalizeGuardAnalysis=(prepared,graph)=>' +
      ref +
      '.finalize?' +
      ref +
      '.finalize(prepared,graph):({report:prepared.providerUnit?.m4Proof?' +
      ref +
      '.native.m4NativePrerequisites(prepared.providerUnit.m4Proof,prepared.m4NativeInventory,graph,new Map()):{fixtureAdoption:true}});'
  );
  const evaluatorURL = data(
    isolate('db-access-evaluator.mjs', {
      './db-access-prepare.mjs': prepareShim,
      './db-access-graph.mjs': graphShim,
      './db-access-finalize.mjs': finalShim,
      './db-access-m4-worker-evidence.mjs': evidenceShim,
      './db-access-graph-workers.mjs': graphURL,
    })
  );
  const evaluator = await import(evaluatorURL);
  const sourceShim = data(
    'export const isVerifiedM4ProofSource=x=>x===' +
      ref +
      '.source;export const m4SourceMatchesModel=(source,model)=>source===' +
      ref +
      '.source&&model===' +
      ref +
      '.prepared.model&&!' +
      ref +
      '.sourceChanged;'
  );
  state.unit = { m4Proof: state.source };
  const providerShim = data(
    'export const isVerifiedProviderUnitSource=x=>x===' +
      ref +
      '.unit;export const providerUnitAnalysisModel=x=>x;'
  );
  const inventoryShim = data('export const collectInventory=()=>' + ref + '.prepared.inventory;');
  const provenanceShim = data('export const createProvenance=()=>' + ref + '.prepared.provenance;');
  const effectsShim = data('export const prepareInventoryEffects=()=>({});');
  const hydratedShim = data('export const isM4HydratedContextInventory=()=>false;');
  const nativeURL = data(
    isolate('db-access-m4-native-prerequisite.mjs', {
      './db-access-graph-worker-pool.mjs': poolURL,
      './db-access-graph-workers.mjs': graphURL,
      './db-access-evaluator.mjs': evaluatorURL,
      './db-access-m4-proof-source.mjs': sourceShim,
      './db-access-provider-unit-source.mjs': providerShim,
      './db-access-inventory.mjs': inventoryShim,
      './db-access-provenance.mjs': provenanceShim,
      './db-access-inventory-preparation.mjs': effectsShim,
      './db-access-m4-worker-input.mjs': hydratedShim,
      './db-access-inventory-wire.mjs': encodeShim,
    })
  );
  state.native = await import(nativeURL);
  state.prepared.m4NativeInventory = state.native.collectM4NativeInventory(
    state.prepared.model,
    new Map(),
    state.unit
  );
  state.snapshot = graph.graphSnapshot(state.prepared);
  state.input = { snapshot: state.snapshot, inventory: state.encode() };
  const authorityText = moduleText('db-access-m4-worker-loader-authority.mjs');
  const bindingFunctions = ['bindM4GraphLoaderEvidence', 'assertM4GraphLoaderEvidence']
    .map(name =>
      authorityText.slice(
        authorityText.indexOf('export function ' + name + '('),
        authorityText.indexOf('\n}', authorityText.indexOf('export function ' + name + '(')) + 2
      )
    )
    .join('\n');
  const loaderState = {
    graphs: new Map([0, 1, 2, 3].map(i => [i, {}])),
    graphEvidence: new WeakSet(),
  };
  state.loaderState = loaderState;
  const bindingURL = data(
    'import {assertM4WorkerEvidenceCurrent} from ' +
      JSON.stringify(poolURL) +
      ';const owned=s=>{if(s!==' +
      ref +
      '.loader)throw Error("unit foreign loader");return ' +
      ref +
      '.loaderState;};const launchAuthority={};const isM4WorkerLoaderLaunchComplete=()=>true;const fail=r=>{throw Error(r);};' +
      bindingFunctions
  );
  const loaderEvidence = await import(bindingURL);
  const createPool = async privateLoader => {
    const value = await pool.startGraphWorkerPool(state.prepared.repoRoot, privateLoader);
    state.pools.push(value);
    return value;
  };
  return {
    state,
    pool,
    graph,
    evaluator,
    loaderEvidence,
    native: state.native,
    createPool,
    request: () => state.native.bindM4WorkerRequest(state.prepared.m4NativeInventory, state.input),
    async cleanup() {
      await Promise.all(state.pools.map(value => value.close()));
      delete globalThis[key];
    },
    outputURL,
  };
}
