import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { freezeOutput, outputShape } from './db-access-output-binding.mjs';
import {
  openM4WorkerLoaderImage,
  assertM4WorkerLoaderImage,
  inspectOwnedM4WorkerLoaderImage,
} from './db-access-m4-worker-loader-image.mjs';
import {
  openM4WorkerLoaderLaunchAuthority,
  createM4WorkerLoaderLaunch,
  workerForM4LoaderLaunch as launchWorker,
  bindingForM4LoaderLaunch as launchBinding,
  isM4LoaderControlMessage as isLaunchControlMessage,
  sealM4WorkerLoads as sealLaunch,
  releaseM4PriorWorker as releasePriorLaunch,
  noteM4GraphWorkerDone as noteGraphLaunchDone,
  completeM4WorkerLoaderLaunch as completeLaunch,
  isM4WorkerLoaderLaunchComplete,
  inspectCompletedM4WorkerLoaderLaunch,
  abortM4WorkerLoaderLaunch,
} from './db-access-m4-worker-loader-launch.mjs';

const sessions = new WeakMap();
const proofs = new WeakMap();
const launchAuthority = openM4WorkerLoaderLaunchAuthority();
const fail = reason => {
  throw new Error('incomplete: M4 worker loader authority ' + reason);
};
const owned = handle => {
  const state = sessions.get(handle);
  if (!state || state.aborted) fail('foreign or aborted session');
  return state;
};

export function openM4WorkerLoaderSession({ candidate, producer, event }) {
  const root = fs.realpathSync(candidate);
  if (root !== path.resolve(candidate)) fail('noncanonical candidate root');
  const imageHandle = openM4WorkerLoaderImage(producer, event);
  const image = inspectOwnedM4WorkerLoaderImage(imageHandle);
  const handle = Object.freeze({ version: 1 });
  sessions.set(handle, {
    handle,
    id: randomUUID(),
    candidate: root,
    producer: image.root,
    event: structuredClone(event),
    eventShape: outputShape(event),
    imageHandle,
    image,
    launches: new Set(),
    prior: undefined,
    graphs: new Map(),
    graphEvidence: new WeakSet(),
    aborted: false,
    finished: false,
  });
  return handle;
}

export function assertM4WorkerLoaderSessionCurrent(session, { candidate, event }) {
  const state = owned(session);
  if (
    fs.realpathSync(candidate) !== state.candidate ||
    outputShape(event).digest !== state.eventShape.digest
  )
    fail('foreign candidate/event session');
}

export function launchM4PriorWorker(session, { repoRoot, event, binding }) {
  const state = owned(session);
  if (state.prior || fs.realpathSync(repoRoot) !== state.candidate) fail('prior launch sequence');
  if (outputShape(event).digest !== state.eventShape.digest || !/^[a-f0-9]{64}$/u.test(binding))
    fail('prior event/binding');
  const nonce = randomUUID();
  const handle = createM4WorkerLoaderLaunch(launchAuthority, state, 'prior', 0, binding, {
    repoRoot: state.candidate,
    event: structuredClone(event),
    nonce,
  });
  state.launches.add(handle);
  state.prior = handle;
  return handle;
}

export function launchM4GraphWorker(session, { repoRoot, index }) {
  const state = owned(session);
  if (
    !state.prior ||
    !isM4WorkerLoaderLaunchComplete(launchAuthority, state.prior) ||
    !Number.isInteger(index) ||
    index < 0 ||
    index > 3
  )
    fail('graph launch before prior or invalid index');
  if (state.graphs.has(index) || fs.realpathSync(repoRoot) !== state.candidate)
    fail('duplicate graph launch or root');
  const channelId = randomUUID();
  const handle = createM4WorkerLoaderLaunch(launchAuthority, state, 'graph', index, channelId, {
    repoRoot: state.candidate,
    m4ChannelId: channelId,
  });
  state.launches.add(handle);
  state.graphs.set(index, handle);
  return handle;
}

export const workerForM4LoaderLaunch = handle => launchWorker(launchAuthority, handle);
export const bindingForM4LoaderLaunch = handle => launchBinding(launchAuthority, handle);
export const isM4LoaderControlMessage = (handle, message) =>
  isLaunchControlMessage(launchAuthority, handle, message);
export const sealM4WorkerLoads = (handle, message) => sealLaunch(launchAuthority, handle, message);
export const releaseM4PriorWorker = handle => releasePriorLaunch(launchAuthority, handle);
export const noteM4GraphWorkerDone = (handle, message) =>
  noteGraphLaunchDone(launchAuthority, handle, message);
export const completeM4WorkerLoaderLaunch = (handle, code) =>
  completeLaunch(launchAuthority, handle, code);

export function bindM4GraphLoaderEvidence(session, proof) {
  const state = owned(session);
  if (
    state.graphs.size !== 4 ||
    [...state.graphs.values()].some(
      handle => !isM4WorkerLoaderLaunchComplete(launchAuthority, handle)
    )
  )
    fail('incomplete four-worker graph loader');
  state.graphEvidence.add(proof);
}

export function assertM4GraphLoaderEvidence(session, proof) {
  const state = owned(session);
  if (!state.graphEvidence.has(proof)) fail('foreign graph loader evidence');
}

export function finishM4WorkerLoaderSession(session) {
  const state = owned(session);
  if (
    state.finished ||
    !state.prior ||
    !isM4WorkerLoaderLaunchComplete(launchAuthority, state.prior) ||
    state.graphs.size !== 4 ||
    [...state.graphs.values()].some(
      handle => !isM4WorkerLoaderLaunchComplete(launchAuthority, handle)
    )
  )
    fail('missing/replayed one-plus-four worker closure');
  state.finished = true;
  const proof = Object.freeze({ version: 1 });
  proofs.set(proof, state);
  return proof;
}

// Data-only inspection of the same live opaque proof. It exposes no root, port,
// Worker, nonce, binding, launch/session id, receipt acceptance path or constructor.
export function inspectM4WorkerLoaderProof(proof) {
  const state = proofs.get(proof);
  if (
    !state ||
    !state.finished ||
    state.aborted ||
    state.launches.size !== 5 ||
    state.graphs.size !== 4
  )
    fail('foreign loader proof');
  const slots = [
    inspectCompletedM4WorkerLoaderLaunch(launchAuthority, state.prior, 'prior', 0),
    ...[0, 1, 2, 3].map(index =>
      inspectCompletedM4WorkerLoaderLaunch(launchAuthority, state.graphs.get(index), 'graph', index)
    ),
  ];
  const { executable: _privateExecutable, ...node } = state.image.node;
  return freezeOutput({
    version: 1,
    scope: 'LOADER_ONLY_LOCAL',
    cardinality: { priorWorkers: 1, graphWorkers: 4, workers: 5 },
    eventDigest: state.image.eventDigest,
    policyDigest: state.image.policyDigest,
    imageDigest: state.image.imageDigest,
    contractDigest: state.image.contractDigest,
    preloadDigest: state.image.preloadDigest,
    workerSourceDigest: outputShape(slots).digest,
    node,
    hostedLinuxQualified: state.image.hostedLinuxQualified,
    sourceDataReadsQualified: false,
    runtimeAdmission: false,
    slots,
  });
}

export function assertM4WorkerLoaderProofCurrent(proof, { producer, event }) {
  const state = proofs.get(proof);
  if (!state || !state.finished || state.aborted) fail('foreign loader proof');
  assertM4WorkerLoaderImage(state.imageHandle, producer, event);
  return inspectM4WorkerLoaderProof(proof);
}

export async function abortM4WorkerLoaderSession(session) {
  const state = sessions.get(session);
  if (!state || state.aborted) return;
  state.aborted = true;
  await Promise.allSettled(
    [...state.launches].map(handle => abortM4WorkerLoaderLaunch(launchAuthority, handle))
  );
}
