import { Worker } from 'node:worker_threads';
const owned = new WeakMap();
const fail = reason => new Error('incomplete: graph worker ' + reason);
export function startGraphWorkerPool(repoRoot) {
  const slots = [],
    state = { slots, used: false };
  const pool = Object.freeze({
    async close() {
      await Promise.allSettled(slots.map(slot => slot.worker.terminate()));
    },
  });
  owned.set(pool, state);
  try {
    for (let index = 0; index < 4; index++) {
      const worker = new Worker(new URL('./db-access-graph-worker.mjs', import.meta.url), {
        env: {},
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 1024 },
        workerData: { repoRoot },
      });
      let readyResolve, readyReject, exitResolve, exitReject;
      const ready = new Promise((resolve, reject) => {
        readyResolve = resolve;
        readyReject = reject;
      });
      const exited = new Promise((resolve, reject) => {
        exitResolve = resolve;
        exitReject = reject;
      });
      ready.catch(() => {});
      exited.catch(() => {});
      const slot = {
        worker,
        ready,
        exited,
        phase: 'starting',
        snapshot: undefined,
        request: undefined,
      };
      slots.push(slot);
      const reject = error => {
        slot.phase = 'failed';
        slot.error = error;
        readyReject(error);
        exitReject(error);
        slot.request?.reject(error);
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
          message.snapshot === slot.snapshot &&
          message.jobId === slot.request?.jobId
        ) {
          slot.phase = 'ready';
          slot.request.resolve(message);
          slot.request = undefined;
          return;
        }
        if (
          slot.phase === 'stopping' &&
          message?.type === 'DONE' &&
          message.snapshot === slot.snapshot
        ) {
          slot.phase = 'done';
          return;
        }
        reject(fail('invalid READY/RUN/RESULT/STOP sequence'));
      });
      worker.once('error', reject);
      worker.once('exit', code =>
        code === 0 && slot.phase === 'done'
          ? exitResolve()
          : reject(fail('exit before complete batch session'))
      );
    }
  } catch (error) {
    state.error = error;
  }
  return pool;
}
export async function runOwnedGraphWorkerPool(pool, partitions, input) {
  const state = owned.get(pool);
  if (!state || state.used || !Array.isArray(partitions) || !partitions.length)
    throw fail('unowned or reused pool');
  state.used = true;
  if (state.error) throw state.error;
  await Promise.all(state.slots.map(slot => slot.ready));
  if (state.slots.some(slot => slot.phase !== 'ready' || slot.snapshot !== input.snapshot))
    throw fail('startup source mismatch');
  let next = 0;
  const results = new Array(partitions.length);
  await Promise.all(
    state.slots.map(async slot => {
      let first = true;
      while (next < partitions.length) {
        if (slot.error) throw slot.error;
        const jobId = next++;
        const result = new Promise((resolve, reject) => {
          slot.request = { jobId, resolve, reject };
        });
        slot.phase = 'running';
        slot.worker.postMessage({
          ...(first ? input : { snapshot: input.snapshot }),
          type: 'RUN',
          jobId,
          origins: partitions[jobId],
        });
        first = false;
        results[jobId] = await result;
      }
      if (slot.error) throw slot.error;
      slot.phase = 'stopping';
      slot.worker.postMessage({ type: 'STOP', snapshot: input.snapshot });
      await slot.exited;
    })
  );
  if (
    results.filter(Boolean).length !== partitions.length ||
    results.some((value, index) => !value || value.jobId !== index)
  )
    throw fail('missing batch result');
  return results;
}
