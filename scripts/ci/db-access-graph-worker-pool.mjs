import { Worker } from 'node:worker_threads';
const owned = new WeakMap();
const fail = reason => new Error('incomplete: graph worker ' + reason);
export function startGraphWorkerPool(repoRoot) {
  const slots = [];
  const pool = Object.freeze({
    async close() {
      await Promise.allSettled(slots.map(slot => slot.worker.terminate()));
    },
  });
  owned.set(pool, { slots, used: false });
  try {
    for (let index = 0; index < 2; index++) {
      const worker = new Worker(new URL('./db-access-graph-worker.mjs', import.meta.url), {
        env: {},
        execArgv: [],
        workerData: { repoRoot },
      });
      let readyResolve, readyReject, resultResolve, resultReject;
      const ready = new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      const result = new Promise((resolve, reject) => {
        resultResolve = resolve;
        resultReject = reject;
      });
      // Setup runs concurrently with synchronous parent inventory. Rejections remain observed.
      ready.catch(() => {});
      result.catch(() => {});
      const slot = {
        worker,
        ready,
        result,
        phase: 'starting',
        snapshot: undefined,
        answer: undefined,
      };
      slots.push(slot);
      const reject = error => {
        slot.phase = 'failed';
        readyReject(error);
        resultReject(error);
      };
      worker.on('message', message => {
        if (
          slot.phase === 'starting' &&
          message?.type === 'READY' &&
          typeof message.snapshot === 'string'
        ) {
          slot.snapshot = message.snapshot;
          slot.phase = 'ready';
          readyResolve();
          return;
        }
        if (
          slot.phase === 'running' &&
          message?.type === 'RESULT' &&
          message.snapshot === slot.snapshot
        ) {
          slot.answer = message;
          slot.phase = 'answered';
          return;
        }
        reject(fail('invalid READY/RUN/RESULT sequence'));
      });
      worker.once('error', reject);
      worker.once('exit', code => {
        if (code === 0 && slot.phase === 'answered') {
          slot.phase = 'exited';
          resultResolve(slot.answer);
        } else reject(fail('exit before complete owned result'));
      });
    }
  } catch (error) {
    owned.get(pool).error = error;
  }
  return pool;
}
export async function runOwnedGraphWorkerPool(pool, partitions, input) {
  const state = owned.get(pool);
  if (!state || state.used || partitions.length < 1 || partitions.length > 2)
    throw fail('unowned or reused pool');
  state.used = true;
  if (state.error) throw state.error;
  const slots = state.slots.slice(0, partitions.length);
  await Promise.all(slots.map(slot => slot.ready));
  for (const [index, slot] of slots.entries()) {
    if (slot.phase !== 'ready' || slot.snapshot !== input.snapshot)
      throw fail('startup source mismatch');
    slot.phase = 'running';
    slot.worker.postMessage({ ...input, type: 'RUN', origins: partitions[index] });
  }
  return Promise.all(slots.map(slot => slot.result));
}
