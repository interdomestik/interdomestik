import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ADOPTION } from './db-access-adoption.mjs';
import { outputShape } from './db-access-output-binding.mjs';
import { computePriorControls } from './db-access-prior-controls.mjs';
import {
  currentPriorBinding,
  trustedDigest,
  priorEvent,
  validatePriorMessage,
  priorFailure,
} from './db-access-m4-prior-source.mjs';
import {
  launchM4PriorWorker,
  workerForM4LoaderLaunch,
  bindingForM4LoaderLaunch,
  isM4LoaderControlMessage,
  sealM4WorkerLoads,
  releaseM4PriorWorker,
  completeM4WorkerLoaderLaunch,
} from './db-access-m4-worker-loader-authority.mjs';

const handles = new WeakMap(),
  records = new WeakMap(),
  consumed = new WeakSet();
function owned(handle) {
  const state = handles.get(handle);
  if (!state) throw priorFailure('foreign or serialized handle');
  return state;
}
export function startM4PriorPreparation(repoRoot, event, loaderSession) {
  const root = fs.realpathSync(repoRoot),
    bound = priorEvent(event);
  const state = {
    root,
    event: bound,
    binding: currentPriorBinding(root, bound),
    phase: 'running',
    closed: false,
    bound: false,
    waited: false,
  };
  const launch = launchM4PriorWorker(loaderSession, {
    repoRoot: root,
    event: bound,
    binding: state.binding,
  });
  const worker = workerForM4LoaderLaunch(launch);
  state.nonce = bindingForM4LoaderLaunch(launch).nonce;
  state.launch = launch;
  state.worker = worker;
  let resolve,
    reject,
    exitResolve,
    result,
    messages = 0;
  state.ready = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  state.exited = new Promise(yes => {
    exitResolve = yes;
  });
  state.reject = error => {
    if (['complete', 'failed'].includes(state.phase)) return;
    state.phase = 'failed';
    state.result = undefined;
    reject(error);
  };
  // SQL blocks the parent synchronously; retain the rejection for the actual waiter.
  state.ready.catch(() => {});
  worker.on('message', async message => {
    if (isM4LoaderControlMessage(launch, message)) return;
    if (state.phase !== 'running') {
      state.reject(priorFailure('message during loader seal'));
      return;
    }
    try {
      if (++messages !== 1) throw priorFailure('duplicate result');
      result = validatePriorMessage(state, message);
      state.phase = 'sealing';
      await sealM4WorkerLoads(launch, message);
      releaseM4PriorWorker(launch);
      state.phase = 'released';
    } catch (error) {
      state.reject(error);
    }
  });
  worker.on('error', error => state.reject(error));
  worker.on('messageerror', error => state.reject(error));
  worker.once('exit', code => {
    exitResolve();
    if (state.phase === 'failed') return;
    if (state.closed || state.phase !== 'released' || code !== 0 || messages !== 1 || !result) {
      state.reject(priorFailure('missing result, premature close or nonzero exit'));
      return;
    }
    try {
      completeM4WorkerLoaderLaunch(launch, code);
      if (currentPriorBinding(root, bound) !== state.binding)
        throw priorFailure('source/event changed before completion');
      state.result = result;
      state.phase = 'complete';
      resolve();
    } catch (error) {
      state.reject(error);
    }
  });
  const handle = Object.freeze({ version: 1, id: randomUUID() });
  handles.set(handle, state);
  return handle;
}
export function waitM4PriorPreparation(handle) {
  const state = owned(handle);
  return state.ready.then(() => {
    if (state.closed || state.phase !== 'complete') throw priorFailure('closed preparation');
    state.waited = true;
  });
}
export function bindM4PriorPreparation(handle, prepared, event) {
  const state = owned(handle);
  if (state.closed || state.phase !== 'complete' || !state.waited)
    throw priorFailure('result not awaited or closed');
  if (state.bound || records.has(prepared) || consumed.has(prepared))
    throw priorFailure('duplicate bind');
  if (prepared.adoption !== ADOPTION || fs.realpathSync(prepared.repoRoot) !== state.root)
    throw priorFailure('foreign prepared authority');
  if (
    currentPriorBinding(state.root, priorEvent(event)) !== state.binding ||
    trustedDigest(prepared.trusted) !== state.result.snapshotDigest
  )
    throw priorFailure('source/event/historical snapshot mismatch');
  records.set(prepared, {
    state,
    adoption: prepared.adoption,
    trusted: prepared.trusted,
    model: prepared.model,
    result: state.result,
  });
  state.bound = true;
}
export function priorControlsFor(prepared) {
  if (consumed.has(prepared)) throw priorFailure('already consumed');
  const record = records.get(prepared);
  if (!record) return computePriorControls(prepared.trusted);
  records.delete(prepared);
  consumed.add(prepared);
  const { state, result } = record;
  if (
    state.closed ||
    state.phase !== 'complete' ||
    prepared.adoption !== ADOPTION ||
    record.adoption !== prepared.adoption ||
    record.trusted !== prepared.trusted ||
    record.model !== prepared.model ||
    fs.realpathSync(prepared.repoRoot) !== state.root ||
    trustedDigest(prepared.trusted) !== result.snapshotDigest ||
    currentPriorBinding(state.root, state.event) !== state.binding ||
    outputShape(result.controls).digest !== result.controlsDigest
  )
    throw priorFailure('changed prepared/source/event on consume');
  return structuredClone(result.controls);
}
export async function closeM4PriorPreparation(handle) {
  const state = owned(handle);
  if (state.closed) {
    await state.exited;
    return;
  }
  state.closed = true;
  state.reject(priorFailure('closed before completion'));
  if (state.phase !== 'complete') await state.worker.terminate();
  await state.exited;
  await state.ready.catch(() => {});
}
