import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MessagePort, Worker } from 'node:worker_threads';
import { m4WorkerLoaderPreloadUrl } from './db-access-m4-worker-loader-preload.mjs';

const authorities = new WeakMap();
const fail = reason => {
  throw new Error('incomplete: M4 worker loader launch ' + reason);
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const authorityState = authority => {
  const state = authorities.get(authority);
  if (!state) fail('foreign launch authority');
  return state;
};
const owned = (authority, handle) => {
  const state = authorityState(authority).launches.get(handle);
  if (!state || state.aborted || state.owner.aborted) fail('foreign or aborted launch');
  return state;
};
const ownedForAbort = (authority, handle) => {
  const state = authorityState(authority).launches.get(handle);
  if (!state) fail('foreign launch');
  return state;
};

export function openM4WorkerLoaderLaunchAuthority() {
  const authority = Object.freeze({ version: 1 });
  authorities.set(authority, {
    launches: new WeakMap(),
    applicationMessages: new WeakMap(),
    controlMessages: new WeakMap(),
  });
  return authority;
}

function manifestFor(owner, role, index, binding, launchId) {
  const contract = owner.image.roles[role];
  return Object.freeze({
    version: 1,
    root: owner.image.root,
    sessionId: owner.id,
    launchId,
    role,
    index,
    binding,
    eventDigest: owner.image.eventDigest,
    policyDigest: owner.image.policyDigest,
    imageDigest: owner.image.imageDigest,
    contractDigest: owner.image.contractDigest,
    preloadDigest: owner.image.preloadDigest,
    files: contract.files,
    requiredFiles: contract.requiredFiles,
    builtins: contract.builtins,
  });
}

export function createM4WorkerLoaderLaunch(authority, owner, role, index, binding, workerData) {
  const authorityOwned = authorityState(authority);
  const contract = owner.image.roles[role];
  if (!contract || (role === 'prior' && typeof workerData?.nonce !== 'string'))
    fail('role/worker input');
  const launchId = randomUUID();
  const manifest = manifestFor(owner, role, index, binding, launchId);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  const worker = new Worker(pathToFileURL(path.join(owner.image.root, contract.entry)), {
    env: {},
    execArgv: ['--no-addons', '--import', m4WorkerLoaderPreloadUrl()],
    resourceLimits: {
      maxOldGenerationSizeMb: role === 'prior' ? 3072 : 1536,
    },
    workerData: {
      ...workerData,
      m4LoaderRequired: true,
      m4LoaderManifestBase64: manifestBytes.toString('base64'),
      m4LoaderManifestSha256: sha(manifestBytes),
    },
  });
  const handle = Object.freeze({ version: 1 });
  const state = {
    owner,
    handle,
    worker,
    role,
    index,
    binding,
    nonce: role === 'prior' ? workerData.nonce : undefined,
    launchId,
    manifest,
    phase: 'starting',
    port: undefined,
    seal: undefined,
    doneSeen: false,
    complete: false,
    aborted: false,
    error: undefined,
  };
  authorityOwned.launches.set(handle, state);
  worker.on('message', message => {
    if (message?.type === 'M4_LOADER_PORT') {
      authorityOwned.controlMessages.set(message, state);
      if (
        state.phase !== 'starting' ||
        !(message.port instanceof MessagePort) ||
        message.sessionId !== owner.id ||
        message.launchId !== launchId ||
        message.role !== role ||
        message.index !== index ||
        message.binding !== binding
      ) {
        state.error = new Error('foreign loader port');
        void worker.terminate();
        return;
      }
      state.port = message.port;
      state.phase = 'loader-ready';
      return;
    }
    if (message && typeof message === 'object')
      authorityOwned.applicationMessages.set(message, state);
  });
  worker.once('error', error => {
    state.error = error;
    state.seal?.reject(error);
  });
  worker.once('exit', code => {
    state.exitCode = code;
    if (state.phase === 'sealing')
      state.seal?.reject(new Error('worker exited before loader seal'));
  });
  return handle;
}

export const workerForM4LoaderLaunch = (authority, handle) => owned(authority, handle).worker;
export function bindingForM4LoaderLaunch(authority, handle) {
  const state = owned(authority, handle);
  return Object.freeze({
    role: state.role,
    index: state.index,
    binding: state.binding,
    ...(state.nonce ? { nonce: state.nonce } : {}),
  });
}
export function isM4LoaderControlMessage(authority, handle, message) {
  return authorityState(authority).controlMessages.get(message) === owned(authority, handle);
}

function expectedSeal(state, token, receipt) {
  const role = state.owner.image.roles[state.role];
  const filesDigest = sha(
    JSON.stringify(
      Object.entries(role.files)
        .map(([name, value]) => [name, value.sha256])
        .sort()
    )
  );
  const builtinDigest = sha(JSON.stringify([...role.builtins].sort()));
  return (
    receipt?.type === 'M4_LOADER_SEALED' &&
    receipt.token === token &&
    receipt.sessionId === state.owner.id &&
    receipt.launchId === state.launchId &&
    receipt.role === state.role &&
    receipt.index === state.index &&
    receipt.binding === state.binding &&
    receipt.eventDigest === state.owner.image.eventDigest &&
    receipt.policyDigest === state.owner.image.policyDigest &&
    receipt.imageDigest === state.owner.image.imageDigest &&
    receipt.contractDigest === state.owner.image.contractDigest &&
    receipt.preloadDigest === state.owner.image.preloadDigest &&
    receipt.filesDigest === filesDigest &&
    receipt.fileCount === role.requiredFiles.length &&
    receipt.builtinDigest === builtinDigest &&
    Number.isSafeInteger(receipt.resolveCount) &&
    Number.isSafeInteger(receipt.loadCount)
  );
}

export async function sealM4WorkerLoads(authority, handle, applicationMessage) {
  const authorityOwned = authorityState(authority);
  const state = owned(authority, handle);
  if (
    state.phase !== 'loader-ready' ||
    authorityOwned.applicationMessages.get(applicationMessage) !== state
  )
    fail('foreign/replayed checkpoint message');
  if (
    (state.role === 'prior' &&
      (applicationMessage?.type !== 'm4-prior-controls/1' ||
        applicationMessage.nonce !== state.nonce ||
        applicationMessage.binding !== state.binding)) ||
    (state.role === 'graph' &&
      (applicationMessage?.type !== 'READY' || applicationMessage.channelId !== state.binding))
  )
    fail('checkpoint application join');
  authorityOwned.applicationMessages.delete(applicationMessage);
  state.phase = 'sealing';
  const token = randomUUID();
  const sealed = new Promise((resolve, reject) => {
    state.seal = { resolve, reject };
    state.port.once('message', receipt => {
      if (!expectedSeal(state, token, receipt)) {
        reject(new Error('foreign/mixed loader seal'));
        void state.worker.terminate();
        return;
      }
      state.phase = 'sealed';
      state.loaderReceipt = receipt;
      resolve();
    });
  });
  state.port.postMessage({ type: 'M4_LOADER_SEAL', token });
  await sealed;
}

export function releaseM4PriorWorker(authority, handle) {
  const state = owned(authority, handle);
  if (state.role !== 'prior' || state.phase !== 'sealed') fail('prior release sequence');
  state.phase = 'released';
  state.worker.postMessage({
    type: 'M4_LOADER_RELEASE',
    nonce: state.nonce,
    binding: state.binding,
  });
}

export function noteM4GraphWorkerDone(authority, handle, message) {
  const authorityOwned = authorityState(authority);
  const state = owned(authority, handle);
  if (
    state.role !== 'graph' ||
    state.phase !== 'sealed' ||
    state.doneSeen ||
    authorityOwned.applicationMessages.get(message) !== state ||
    message?.type !== 'DONE'
  )
    fail('graph final application join');
  authorityOwned.applicationMessages.delete(message);
  state.doneSeen = true;
}

export function completeM4WorkerLoaderLaunch(authority, handle, code) {
  const state = owned(authority, handle);
  if (
    state.complete ||
    state.error ||
    state.exitCode !== code ||
    code !== 0 ||
    (state.role === 'prior' ? state.phase !== 'released' : !state.doneSeen)
  )
    fail('incomplete/nonzero worker exit');
  state.complete = true;
  state.port.close();
}

export function isM4WorkerLoaderLaunchComplete(authority, handle) {
  return owned(authority, handle).complete;
}

export function inspectCompletedM4WorkerLoaderLaunch(authority, handle, role, index) {
  const state = owned(authority, handle);
  const receipt = state.loaderReceipt;
  const contract = state.owner.image.roles[role];
  if (
    !state.complete ||
    state.error ||
    state.role !== role ||
    state.index !== index ||
    !receipt ||
    receipt.fileCount !== contract.requiredFiles.length ||
    !Number.isSafeInteger(receipt.resolveCount) ||
    !Number.isSafeInteger(receipt.loadCount)
  )
    fail('incomplete launch inspection');
  return Object.freeze({
    role,
    index,
    loadedFiles: Object.freeze([...contract.requiredFiles]),
    fileCount: receipt.fileCount,
    filesDigest: receipt.filesDigest,
    builtinDigest: receipt.builtinDigest,
    resolveCount: receipt.resolveCount,
    loadCount: receipt.loadCount,
    actualSetEqualsContract: true,
  });
}

export async function abortM4WorkerLoaderLaunch(authority, handle) {
  const state = ownedForAbort(authority, handle);
  if (state.aborted) return;
  state.aborted = true;
  if (!state.complete) await state.worker.terminate();
  state.port?.close();
}
