import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { currentM4ProducerSeal, expectedM4TransportAck } from './db-access-m4-worker-evidence.mjs';
import { outputShape, sameOutputShape } from './db-access-output-binding.mjs';

const owned = new WeakMap();
const evidence = new WeakSet();
const observations = new WeakSet();
const resultEvidence = new WeakMap();
const evidenceSeals = new WeakMap();
const receivedOutputs = new WeakSet();
const fail = reason => new Error('incomplete: graph worker ' + reason);

export function assertM4WorkerEvidenceCurrent(proof) {
  if (!evidence.has(proof) || evidenceSeals.get(proof) !== currentM4ProducerSeal())
    throw fail('foreign or changed producer evidence');
}
export const isOwnedM4WorkerEvidence = value => evidence.has(value);
function takeTransportResult(results) {
  const value = resultEvidence.get(results);
  if (!value) throw fail('unowned or replayed transport result');
  resultEvidence.delete(results);
  if (!sameOutputShape(value.output, results)) throw fail('changed/replaced transport output');
  return value;
}
export function claimOwnedM4WorkerEvidence(results) {
  const value = takeTransportResult(results);
  if (value.kind !== 'qualified-loader')
    throw fail('ordinary observations are not private evidence');
  return value.proof;
}
export function claimOwnedM4GraphTransport(results) {
  const { kind, proof } = takeTransportResult(results);
  return Object.freeze({ kind, proof });
}
export function assertM4ObservationEvidenceCurrent(proof) {
  if (!observations.has(proof) || evidenceSeals.get(proof) !== currentM4ProducerSeal())
    throw fail('foreign or changed ordinary observation evidence');
}

function buildPool(repoRoot, loaderSession, loaderAuthority) {
  const slots = [];
  const state = {
    slots,
    used: false,
    producerSeal: currentM4ProducerSeal(),
    loaderSession,
    loaderAuthority,
  };
  const pool = Object.freeze({
    async close() {
      await Promise.allSettled(slots.map(slot => slot.worker.terminate()));
    },
  });
  owned.set(pool, state);
  try {
    for (let index = 0; index < 4; index++) {
      const launch =
        loaderSession !== undefined
          ? loaderAuthority.launchM4GraphWorker(loaderSession, {
              repoRoot,
              index,
            })
          : undefined;
      const channelId = launch
        ? loaderAuthority.bindingForM4LoaderLaunch(launch).binding
        : randomUUID();
      const worker = launch
        ? loaderAuthority.workerForM4LoaderLaunch(launch)
        : new Worker(new URL('./db-access-graph-worker.mjs', import.meta.url), {
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
        launch,
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
      const onMessage = async message => {
        if (launch && loaderAuthority.isM4LoaderControlMessage(launch, message)) return;
        if (
          slot.phase === 'starting' &&
          message?.type === 'READY' &&
          typeof message.snapshot === 'string' &&
          message.channelId === slot.channelId
        ) {
          slot.phase = 'sealing-ready';
          if (launch) await loaderAuthority.sealM4WorkerLoads(launch, message);
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
          )
            throw fail('foreign/replayed/partial worker transport acknowledgement');
          if (slot.request.m4Expected) receivedOutputs.add(message);
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
          )
            throw fail('worker transport final bookend');
          if (launch) loaderAuthority.noteM4GraphWorkerDone(launch, message);
          slot.phase = 'done';
          return;
        }
        throw fail('invalid READY/RUN/RESULT/STOP sequence');
      };
      worker.on('message', message => void onMessage(message).catch(reject));
      worker.once('error', reject);
      worker.once('exit', code => {
        if (code !== 0 || slot.phase !== 'done') {
          reject(fail('exit before complete batch session'));
          return;
        }
        try {
          if (launch) loaderAuthority.completeM4WorkerLoaderLaunch(launch, code);
          exitResolve();
        } catch (error) {
          reject(error);
        }
      });
    }
  } catch (error) {
    state.error = error;
  }
  return pool;
}

export function startGraphWorkerPool(repoRoot, loaderSession) {
  if (loaderSession === undefined) return buildPool(repoRoot);
  return import(new URL('./db-access-m4-worker-loader-authority.mjs', import.meta.url)).then(
    authority => buildPool(repoRoot, loaderSession, authority)
  );
}

export async function runOwnedGraphWorkerPool(pool, partitions, input, m4Request) {
  const state = owned.get(pool);
  if (!state || state.used || !Array.isArray(partitions)) throw fail('unowned or reused pool');
  if (!partitions.length && !m4Request) throw fail('empty ordinary partition');
  if (state.loaderSession !== undefined && !m4Request) throw fail('M4 loader/request mismatch');
  state.used = true;
  let m4Authority;
  if (m4Request) {
    m4Authority = await import(new URL('./db-access-m4-native-prerequisite.mjs', import.meta.url));
    m4Authority.consumeM4WorkerRequest(m4Request, input);
    if (JSON.stringify(partitions.flat()) !== JSON.stringify(input.inventory.changed))
      throw fail('M4 incomplete root partition');
    if (currentM4ProducerSeal() !== state.producerSeal)
      throw fail('producer changed before dispatch');
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
            m4Expected: wire ? expectedM4TransportAck(wire, true, jobId) : undefined,
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
      slot.m4DoneExpected = wire ? expectedM4TransportAck(wire, used) : undefined;
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
    if (currentM4ProducerSeal() !== state.producerSeal)
      throw fail('producer changed after worker completion');
    if (results.some(result => !receivedOutputs.has(result)))
      throw fail('changed/replaced received output');
    const output = outputShape(results);
    const proof = Object.freeze({
      outputDigest: output.digest,
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
      ...(state.loaderSession === undefined
        ? { observationOnly: true, loaderQualified: false }
        : {}),
    });
    if (state.loaderSession !== undefined) evidence.add(proof);
    else observations.add(proof);
    evidenceSeals.set(proof, state.producerSeal);
    resultEvidence.set(results, {
      kind: state.loaderSession !== undefined ? 'qualified-loader' : 'ordinary-observation',
      proof,
      output,
    });
    if (state.loaderSession !== undefined)
      state.loaderAuthority.bindM4GraphLoaderEvidence(state.loaderSession, proof);
  }
  return results;
}
