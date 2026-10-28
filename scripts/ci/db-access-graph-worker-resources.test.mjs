import fs from 'node:fs';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
let sequence = 0;
const evidenceModule =
  'data:text/javascript;base64,' +
  Buffer.from(
    `export const currentM4ProducerSeal=()=>"unit-seal";
export const expectedM4TransportAck=()=>{throw Error("unexpected M4 in ordinary resource unit");};
export const markReceivedM4WorkerOutput=()=>{};
export const isReceivedM4WorkerOutput=()=>true;
export const registerM4WorkerEvidence=()=>{};
export const shapeM4WorkerResults=()=>({digest:"unit-output"});
export const assertM4WorkerEvidenceCurrent=()=>{};
export const isOwnedM4WorkerEvidence=()=>false;
export const claimOwnedM4WorkerEvidence=()=>{throw Error("not M4")};`
  ).toString('base64');
async function fixture(mode = 'normal') {
  const workers = [];
  class Worker extends EventEmitter {
    constructor(url, options) {
      super();
      this.options = options;
      this.messages = [];
      this.index = workers.length;
      workers.push(this);
      queueMicrotask(() =>
        this.emit('message', {
          type: 'READY',
          snapshot: 'same',
          channelId: options.workerData.m4ChannelId,
        })
      );
    }
    postMessage(message) {
      this.messages.push(message);
      queueMicrotask(() => {
        if (message.type === 'STOP') {
          this.emit('message', { type: 'DONE', snapshot: 'same' });
          this.emit('exit', 0);
        } else if (mode === 'oom' && this.index === 0) {
          this.emit(
            'error',
            Object.assign(new Error('worker heap exhausted'), {
              code: 'ERR_WORKER_OUT_OF_MEMORY',
            })
          );
        } else {
          this.emit('message', {
            type: 'RESULT',
            snapshot: 'same',
            jobId: mode === 'foreign' ? 99 : message.jobId,
          });
        }
      });
    }
    async terminate() {
      this.terminated = true;
      return 1;
    }
  }
  const key = '__pool4Test' + sequence++;
  globalThis[key] = Worker;
  const source = fs
    .readFileSync(new URL('./db-access-graph-worker-pool.mjs', import.meta.url), 'utf8')
    .replaceAll("'./db-access-m4-worker-evidence.mjs'", JSON.stringify(evidenceModule))
    .replaceAll(
      "'./db-access-output-binding.mjs'",
      JSON.stringify(new URL('./db-access-output-binding.mjs', import.meta.url).href)
    )
    .replace("import { Worker } from 'node:worker_threads';", `const Worker = globalThis.${key};`)
    .replaceAll(
      'import.meta.url',
      JSON.stringify(new URL('./db-access-graph-worker-pool.mjs', import.meta.url).href)
    );
  const module = await import('data:text/javascript,' + encodeURIComponent(source));
  delete globalThis[key];
  const pool = module.startGraphWorkerPool('/owned');
  return { ...module, pool, workers };
}
test('four capped workers, two jobs: idle workers STOP and all exit before acceptance', async () => {
  const f = await fixture();
  try {
    const results = await f.runOwnedGraphWorkerPool(f.pool, [['a'], ['b']], {
      snapshot: 'same',
    });
    assert.equal(f.workers.length, 4);
    assert.deepEqual(
      results.map(x => x.jobId),
      [0, 1]
    );
    for (const worker of f.workers) {
      assert.deepEqual(worker.options.resourceLimits, {
        maxOldGenerationSizeMb: 1536,
      });
      assert.deepEqual(worker.options.env, {});
      assert.deepEqual(worker.options.execArgv, []);
      assert.equal(worker.messages.at(-1).type, 'STOP');
    }
    assert.equal(f.workers.filter(w => w.messages.length === 1).length, 2);
    await assert.rejects(
      f.runOwnedGraphWorkerPool(f.pool, [['a']], { snapshot: 'same' }),
      /reused/
    );
  } finally {
    await f.pool.close();
  }
  assert.ok(f.workers.every(w => w.terminated));
});
for (const mode of ['oom', 'foreign'])
  test(mode + ' rejects whole pool and owned cleanup terminates all four', async () => {
    const f = await fixture(mode);
    try {
      await assert.rejects(
        f.runOwnedGraphWorkerPool(f.pool, [['a'], ['b']], {
          snapshot: 'same',
        })
      );
    } finally {
      await f.pool.close();
    }
    assert.ok(f.workers.every(w => w.terminated));
  });
