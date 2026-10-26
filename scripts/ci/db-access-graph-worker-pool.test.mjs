import fs from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
let mode = 'ok',
  closed = 0,
  instances = [];
globalThis.__batchWorker = class extends EventEmitter {
  constructor(url, options) {
    super();
    assert.deepEqual(options.env, {});
    this.jobs = [];
    instances.push(this);
    queueMicrotask(() =>
      this.emit('message', {
        type: 'READY',
        snapshot: 's',
        channelId: options.workerData.m4ChannelId,
      })
    );
  }
  postMessage(input) {
    if (input.type === 'STOP') {
      queueMicrotask(() => {
        this.emit('message', { type: 'DONE', snapshot: 's' });
        this.emit('exit', 0);
      });
      return;
    }
    assert.ok(!this.jobs.length || input.jobId > this.jobs.at(-1));
    this.jobs.push(input.jobId);
    if (this.jobs.length > 1) assert.equal(input.inventory, undefined);
    setImmediate(() => {
      if (mode === 'error') {
        this.emit('error', Error('batch failed'));
        return;
      }
      if (mode === 'missing') {
        this.emit('exit', 0);
        return;
      }
      const result = {
        type: 'RESULT',
        snapshot: 's',
        jobId: mode === 'foreign' ? 999 : input.jobId,
        origins: input.origins,
      };
      this.emit('message', result);
      if (mode === 'duplicate') this.emit('message', result);
    });
  }
  async terminate() {
    closed++;
    return 0;
  }
};
let source = fs.readFileSync(new URL('./db-access-graph-worker-pool.mjs', import.meta.url), 'utf8');
source = source
  .replace(
    "'./db-access-output-binding.mjs'",
    JSON.stringify(new URL('./db-access-output-binding.mjs', import.meta.url).href)
  )
  .replace(
    "import { Worker } from 'node:worker_threads';",
    'const Worker=globalThis.__batchWorker;'
  )
  .replaceAll(
    'import.meta.url',
    JSON.stringify(new URL('./db-access-graph-worker-pool.mjs', import.meta.url).href)
  );
const { startGraphWorkerPool, runOwnedGraphWorkerPool } = await import(
  'data:text/javascript,' + encodeURIComponent(source)
);
test('dynamic batches preserve indexed results and each worker increasing job order; one setup per worker', async () => {
  mode = 'ok';
  closed = 0;
  instances = [];
  const pool = startGraphWorkerPool('/owned');
  try {
    const partitions = Array.from({ length: 7 }, (_, i) => ['origin' + i]);
    const result = await runOwnedGraphWorkerPool(pool, partitions, {
      snapshot: 's',
      inventory: {},
      initialUnknown: [],
    });
    assert.deepEqual(
      result.map(x => x.origins),
      partitions
    );
    assert.equal(instances.length, 4);
    assert.equal(
      instances.reduce((sum, w) => sum + w.jobs.length, 0),
      7
    );
    await assert.rejects(runOwnedGraphWorkerPool(pool, partitions, { snapshot: 's' }));
  } finally {
    await pool.close();
  }
  assert.equal(closed, 4);
});
test('missing foreign duplicate and worker error reject whole session and allow cleanup', async () => {
  for (mode of ['missing', 'foreign', 'duplicate', 'error']) {
    closed = 0;
    const pool = startGraphWorkerPool('/owned');
    try {
      await assert.rejects(
        runOwnedGraphWorkerPool(pool, [['a'], ['b'], ['c']], {
          snapshot: 's',
          inventory: {},
          initialUnknown: [],
        })
      );
    } finally {
      await pool.close();
    }
    assert.equal(closed, 4);
  }
});
