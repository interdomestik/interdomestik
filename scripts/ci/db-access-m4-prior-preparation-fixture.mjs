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
  const state = { workers: [], generation: 0, serialCalls: 0 };
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
  const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  state.Worker = Worker;
  state.binding = binding;
  state.compute = () => {
    state.serialCalls++;
    return structuredClone(controls);
  };
  globalThis[key] = state;
  const fakeWorker = data(`export const Worker=globalThis[${JSON.stringify(key)}].Worker;`);
  const fakeSource = data(
    `export {trustedDigest,priorEvent,validatePriorMessage,priorFailure} from '${realSource}'; export const currentPriorBinding=globalThis[${JSON.stringify(key)}].binding;`
  );
  const fakeCompute = data(
    `export const computePriorControls=globalThis[${JSON.stringify(key)}].compute;`
  );
  let text = fs.readFileSync(
    new URL('./db-access-m4-prior-preparation.mjs', import.meta.url),
    'utf8'
  );
  for (const [from, to] of [
    ["'node:worker_threads'", JSON.stringify(fakeWorker)],
    ["'./db-access-m4-prior-source.mjs'", JSON.stringify(fakeSource)],
    ["'./db-access-prior-controls.mjs'", JSON.stringify(fakeCompute)],
    [
      "new URL('./db-access-m4-prior-worker.mjs', import.meta.url)",
      JSON.stringify(new URL('./db-access-m4-prior-worker.mjs', import.meta.url).href),
    ],
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
    const handle = api.startM4PriorPreparation(root, event);
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
