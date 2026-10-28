import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { MessageChannel } from 'node:worker_threads';
import { test } from 'node:test';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
async function fixture() {
  const key = 'm4-launch-state-' + randomUUID();
  const state = { instances: [] };
  state.Worker = class extends EventEmitter {
    constructor(url, options) {
      super();
      this.url = url;
      this.options = options;
      this.sent = [];
      this.terminations = 0;
      state.instances.push(this);
    }
    postMessage(message) {
      this.sent.push(message);
    }
    async terminate() {
      this.terminations += 1;
      this.emit('exit', 1);
      return 1;
    }
  };
  globalThis[key] = state;
  const replacement = `
    import { MessagePort } from 'node:worker_threads';
    export { MessagePort };
    export const Worker = globalThis[${JSON.stringify(key)}].Worker;
  `;
  let source = fs.readFileSync(
    new URL('./db-access-m4-worker-loader-launch.mjs', import.meta.url),
    'utf8'
  );
  assert.equal(source.split("'node:worker_threads'").length, 2);
  source = source.replace("'node:worker_threads'", JSON.stringify(data(replacement)));
  source = source.replace(
    /from '\.\/([^']+)'/gu,
    (_, name) => `from '${new URL(name, import.meta.url).href}'`
  );
  const launchUrl = data(source + `\n//# sourceURL=${key}.mjs`);
  const api = await import(launchUrl);
  const role = name => {
    const relative = `scripts/ci/${name}-entry.mjs`;
    return Object.freeze({
      entry: relative,
      files: Object.freeze({
        [relative]: Object.freeze({ sha256: sha(name), bytes: name.length }),
      }),
      requiredFiles: Object.freeze([relative]),
      builtins: Object.freeze(['node:worker_threads']),
    });
  };
  const owner = Object.freeze({
    id: 'session-id',
    aborted: false,
    image: Object.freeze({
      root: '/private/tmp',
      eventDigest: 'event-digest',
      policyDigest: 'policy-digest',
      imageDigest: 'image-digest',
      contractDigest: 'contract-digest',
      preloadDigest: 'preload-digest',
      roles: Object.freeze({ prior: role('prior'), graph: role('graph') }),
    }),
  });
  return {
    api,
    launchUrl,
    owner,
    instances: state.instances,
    cleanup() {
      delete globalThis[key];
    },
  };
}
async function loadAuthority(f) {
  const imageModule = data(`
    const handle=Object.freeze({image:true});
    export const openM4WorkerLoaderImage=()=>handle;
    export const inspectOwnedM4WorkerLoaderImage=()=>globalThis[${JSON.stringify(
      'm4-authority-image'
    )}];
    export const assertM4WorkerLoaderImage=()=>{};
  `);
  globalThis['m4-authority-image'] = f.owner.image;
  let source = fs.readFileSync(
    new URL('./db-access-m4-worker-loader-authority.mjs', import.meta.url),
    'utf8'
  );
  source = source.replace("'./db-access-m4-worker-loader-image.mjs'", JSON.stringify(imageModule));
  source = source.replace("'./db-access-m4-worker-loader-launch.mjs'", JSON.stringify(f.launchUrl));
  source = source.replace(
    /from '\.\/([^']+)'/gu,
    (_, name) => `from '${new URL(name, import.meta.url).href}'`
  );
  return import(data(source + `\n//# sourceURL=m4-authority-${randomUUID()}.mjs`));
}
function connectLoader(worker, receiptChange = {}) {
  const manifestBytes = Buffer.from(worker.options.workerData.m4LoaderManifestBase64, 'base64');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assert.equal(sha(manifestBytes), worker.options.workerData.m4LoaderManifestSha256);
  const { port1, port2 } = new MessageChannel();
  port1.once('message', request => {
    const filesDigest = sha(
      JSON.stringify(
        Object.entries(manifest.files)
          .map(([name, value]) => [name, value.sha256])
          .sort()
      )
    );
    port1.postMessage({
      type: 'M4_LOADER_SEALED',
      token: request.token,
      sessionId: manifest.sessionId,
      launchId: manifest.launchId,
      role: manifest.role,
      index: manifest.index,
      binding: manifest.binding,
      eventDigest: manifest.eventDigest,
      policyDigest: manifest.policyDigest,
      imageDigest: manifest.imageDigest,
      contractDigest: manifest.contractDigest,
      preloadDigest: manifest.preloadDigest,
      filesDigest,
      fileCount: manifest.requiredFiles.length,
      builtinDigest: sha(JSON.stringify([...manifest.builtins].sort())),
      resolveCount: 3,
      loadCount: 2,
      ...receiptChange,
    });
  });
  const control = {
    type: 'M4_LOADER_PORT',
    sessionId: manifest.sessionId,
    launchId: manifest.launchId,
    role: manifest.role,
    index: manifest.index,
    binding: manifest.binding,
    port: port2,
  };
  worker.emit('message', control);
  return { control, close: () => port1.close() };
}
test('actual launch functions keep authority private and make prior completion one-use', async () => {
  const f = await fixture();
  try {
    const authority = f.api.openM4WorkerLoaderLaunchAuthority();
    const foreignAuthority = f.api.openM4WorkerLoaderLaunchAuthority();
    const nonce = 'prior-nonce';
    const binding = 'a'.repeat(64);
    const handle = f.api.createM4WorkerLoaderLaunch(authority, f.owner, 'prior', 0, binding, {
      repoRoot: '/private/tmp',
      event: { id: 'event' },
      nonce,
    });
    const worker = f.instances[0];
    const loader = connectLoader(worker);
    assert.equal(f.api.isM4LoaderControlMessage(authority, handle, loader.control), true);
    assert.equal(f.api.isM4LoaderControlMessage(authority, handle, { ...loader.control }), false);
    assert.throws(
      () => f.api.bindingForM4LoaderLaunch(foreignAuthority, handle),
      /foreign or aborted launch/u
    );
    const checkpoint = { type: 'm4-prior-controls/1', nonce, binding };
    worker.emit('message', checkpoint);
    await f.api.sealM4WorkerLoads(authority, handle, checkpoint);
    await assert.rejects(
      f.api.sealM4WorkerLoads(authority, handle, checkpoint),
      /foreign\/replayed checkpoint/u
    );
    f.api.releaseM4PriorWorker(authority, handle);
    assert.deepEqual(worker.sent, [{ type: 'M4_LOADER_RELEASE', nonce, binding }]);
    worker.emit('exit', 0);
    f.api.completeM4WorkerLoaderLaunch(authority, handle, 0);
    const inspection = f.api.inspectCompletedM4WorkerLoaderLaunch(authority, handle, 'prior', 0);
    assert.ok(Object.isFrozen(inspection));
    assert.ok(Object.isFrozen(inspection.loadedFiles));
    assert.equal(inspection.actualSetEqualsContract, true);
    assert.throws(
      () => f.api.completeM4WorkerLoaderLaunch(authority, handle, 0),
      /incomplete\/nonzero worker exit/u
    );
    loader.close();
  } finally {
    f.cleanup();
  }
});
test('actual launch functions join graph READY, seal, DONE and exit', async () => {
  const f = await fixture();
  try {
    const authority = f.api.openM4WorkerLoaderLaunchAuthority();
    const binding = 'graph-channel';
    const handle = f.api.createM4WorkerLoaderLaunch(authority, f.owner, 'graph', 2, binding, {
      repoRoot: '/private/tmp',
      m4ChannelId: binding,
    });
    const worker = f.instances[0];
    const loader = connectLoader(worker);
    const ready = { type: 'READY', channelId: binding };
    worker.emit('message', ready);
    await f.api.sealM4WorkerLoads(authority, handle, ready);
    const done = { type: 'DONE' };
    worker.emit('message', done);
    f.api.noteM4GraphWorkerDone(authority, handle, done);
    worker.emit('exit', 0);
    f.api.completeM4WorkerLoaderLaunch(authority, handle, 0);
    assert.equal(f.api.isM4WorkerLoaderLaunchComplete(authority, handle), true);
    loader.close();
  } finally {
    f.cleanup();
  }
});
test('actual launch functions reject a mixed seal and spend the aborted handle', async () => {
  const f = await fixture();
  try {
    const authority = f.api.openM4WorkerLoaderLaunchAuthority();
    const binding = 'graph-channel';
    const handle = f.api.createM4WorkerLoaderLaunch(authority, f.owner, 'graph', 1, binding, {
      repoRoot: '/private/tmp',
      m4ChannelId: binding,
    });
    const worker = f.instances[0];
    const loader = connectLoader(worker, { imageDigest: 'foreign-image' });
    const ready = { type: 'READY', channelId: binding };
    worker.emit('message', ready);
    await assert.rejects(
      f.api.sealM4WorkerLoads(authority, handle, ready),
      /foreign\/mixed loader seal/u
    );
    await f.api.abortM4WorkerLoaderLaunch(authority, handle);
    assert.ok(worker.terminations >= 1);
    assert.throws(
      () => f.api.isM4WorkerLoaderLaunchComplete(authority, handle),
      /foreign or aborted launch/u
    );
    loader.close();
  } finally {
    f.cleanup();
  }
});
test('actual session abort terminates every live partial-startup launch and is idempotent', async () => {
  const f = await fixture();
  try {
    const api = await loadAuthority(f);
    const event = { gitDir: '/private/tmp', context: { id: 'event' } };
    const session = api.openM4WorkerLoaderSession({
      candidate: '/private/tmp',
      producer: '/private/tmp',
      event,
    });
    const prior = api.launchM4PriorWorker(session, {
      repoRoot: '/private/tmp',
      event,
      binding: 'a'.repeat(64),
    });
    const priorBinding = api.bindingForM4LoaderLaunch(prior);
    const priorWorker = f.instances[0];
    const loader = connectLoader(priorWorker);
    const checkpoint = {
      type: 'm4-prior-controls/1',
      nonce: priorBinding.nonce,
      binding: priorBinding.binding,
    };
    priorWorker.emit('message', checkpoint);
    await api.sealM4WorkerLoads(prior, checkpoint);
    api.releaseM4PriorWorker(prior);
    priorWorker.emit('exit', 0);
    api.completeM4WorkerLoaderLaunch(prior, 0);
    const firstGraph = api.launchM4GraphWorker(session, {
      repoRoot: '/private/tmp',
      index: 0,
    });
    const secondGraph = api.launchM4GraphWorker(session, {
      repoRoot: '/private/tmp',
      index: 1,
    });
    await api.abortM4WorkerLoaderSession(session);
    assert.deepEqual(
      f.instances.map(worker => worker.terminations),
      [0, 1, 1]
    );
    await api.abortM4WorkerLoaderSession(session);
    assert.deepEqual(
      f.instances.map(worker => worker.terminations),
      [0, 1, 1]
    );
    assert.throws(() => api.workerForM4LoaderLaunch(firstGraph), /foreign or aborted launch/u);
    assert.throws(() => api.workerForM4LoaderLaunch(secondGraph), /foreign or aborted launch/u);
    loader.close();
  } finally {
    delete globalThis['m4-authority-image'];
    f.cleanup();
  }
});
