import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Worker } from 'node:worker_threads';
const owned = new WeakMap();
const evidence = new WeakSet(),
  resultEvidence = new WeakMap();
export const isOwnedM4WorkerEvidence = value => evidence.has(value);
export function claimOwnedM4WorkerEvidence(results) {
  const value = resultEvidence.get(results);
  if (!value) throw fail('unowned or replayed transport result');
  resultEvidence.delete(results);
  return value;
}
function producerSeal() {
  const policyBytes = fs.readFileSync(
    new URL('./db-access-provider-unit-policy.json', import.meta.url)
  );
  const policy = JSON.parse(policyBytes);
  const names = [
    'db-access-graph-worker.mjs',
    'db-access-graph-worker-pool.mjs',
    'db-access-graph-workers.mjs',
    'db-access-prepare.mjs',
    'db-access-m4-worker-input.mjs',
    'db-access-inventory-wire.mjs',
    'db-access-m4-native-prerequisite.mjs',
  ];
  const hashes = names.map(name => {
    const file = fileURLToPath(new URL('./' + name, import.meta.url));
    const expected = policy.producerFiles['scripts/ci/' + name];
    const bytes = fs.readFileSync(file),
      stat = fs.lstatSync(file);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (
      !expected ||
      stat.isSymbolicLink() ||
      fs.realpathSync(file) !== file ||
      bytes.length !== expected.bytes ||
      digest !== expected.sha256 ||
      (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode
    )
      throw fail('sealed producer URL/code mismatch');
    return digest;
  });
  return createHash('sha256').update(policyBytes).update(JSON.stringify(hashes)).digest('hex');
}
function expectedAck(wire, used, jobId) {
  return {
    channelId: wire.channelId,
    requestId: wire.requestId,
    snapshot: wire.snapshot,
    inventoryDigest: wire.inventoryDigest,
    inventoryCount: wire.inventoryCount,
    modelDigest: wire.modelDigest,
    sourcePolicyDigest: wire.sourcePolicyDigest,
    sourceBookends: wire.sourceBookends,
    used,
    ...(jobId === undefined ? {} : { jobId }),
  };
}
const fail = reason => new Error('incomplete: graph worker ' + reason);
export function startGraphWorkerPool(repoRoot) {
  const slots = [],
    state = { slots, used: false, producerSeal: producerSeal() };
  const pool = Object.freeze({
    async close() {
      await Promise.allSettled(slots.map(slot => slot.worker.terminate()));
    },
  });
  owned.set(pool, state);
  try {
    for (let index = 0; index < 4; index++) {
      const channelId = randomUUID();
      const worker = new Worker(new URL('./db-access-graph-worker.mjs', import.meta.url), {
        env: {},
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 1536 },
        workerData: { repoRoot, m4ChannelId: channelId },
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
        channelId,
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
          typeof message.snapshot === 'string' &&
          message.channelId === slot.channelId
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
          if (
            slot.request.m4Expected &&
            JSON.stringify(message.m4TransportAck) !== JSON.stringify(slot.request.m4Expected)
          ) {
            reject(fail('foreign/replayed/partial worker transport acknowledgement'));
            return;
          }
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
          if (
            slot.m4DoneExpected &&
            JSON.stringify(message.m4Done) !== JSON.stringify(slot.m4DoneExpected)
          ) {
            reject(fail('worker transport final bookend'));
            return;
          }
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
export async function runOwnedGraphWorkerPool(pool, partitions, input, m4Request) {
  const state = owned.get(pool);
  if (!state || state.used || !Array.isArray(partitions) || !partitions.length)
    throw fail('unowned or reused pool');
  state.used = true;
  let m4Authority;
  if (m4Request) {
    m4Authority = await import(new URL('./db-access-m4-native-prerequisite.mjs', import.meta.url));
    m4Authority.consumeM4WorkerRequest(m4Request, input);
    if (JSON.stringify(partitions.flat()) !== JSON.stringify(input.inventory.changed))
      throw fail('M4 incomplete root partition');
    if (producerSeal() !== state.producerSeal) throw fail('producer changed before dispatch');
  }
  if (state.error) throw state.error;
  await Promise.all(state.slots.map(slot => slot.ready));
  if (state.slots.some(slot => slot.phase !== 'ready' || slot.snapshot !== input.snapshot))
    throw fail('startup source mismatch');
  let next = 0;
  const results = new Array(partitions.length);
  await Promise.all(
    state.slots.map(async slot => {
      let first = true;
      const wire = m4Request ? { ...m4Request, channelId: slot.channelId } : undefined;
      let used = false;
      while (next < partitions.length) {
        if (slot.error) throw slot.error;
        const jobId = next++;
        const result = new Promise((resolve, reject) => {
          slot.request = {
            jobId,
            resolve,
            reject,
            m4Expected: wire ? expectedAck(wire, true, jobId) : undefined,
          };
        });
        used = true;
        slot.phase = 'running';
        slot.worker.postMessage({
          ...(first ? input : { snapshot: input.snapshot }),
          ...(wire ? { m4Transport: wire } : {}),
          type: 'RUN',
          jobId,
          origins: partitions[jobId],
        });
        first = false;
        results[jobId] = await result;
      }
      if (slot.error) throw slot.error;
      slot.phase = 'stopping';
      slot.m4DoneExpected = wire ? expectedAck(wire, used) : undefined;
      slot.worker.postMessage({
        type: 'STOP',
        snapshot: input.snapshot,
        ...(wire ? { m4Transport: wire } : {}),
      });
      await slot.exited;
    })
  );
  if (
    results.filter(Boolean).length !== partitions.length ||
    results.some((value, index) => !value || value.jobId !== index)
  )
    throw fail('missing batch result');
  if (m4Request) {
    m4Authority.assertM4WorkerRequestCurrent(m4Request);
    if (producerSeal() !== state.producerSeal)
      throw fail('producer changed after worker completion');
    const proof = Object.freeze({
      requestId: m4Request.requestId,
      snapshot: m4Request.snapshot,
      inventoryDigest: m4Request.inventoryDigest,
      inventoryCount: m4Request.inventoryCount,
      sourcePolicyDigest: m4Request.sourcePolicyDigest,
      sourceBookends: m4Request.sourceBookends,
      workersExited: state.slots.length,
      partitions: results.length,
      runtimeAdmission: false,
      allExecutableContextsQualified: false,
    });
    evidence.add(proof);
    resultEvidence.set(results, proof);
  }
  return results;
}
