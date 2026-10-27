import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const data = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

async function fixture() {
  const key = 'm4-loader-inspection-' + randomUUID();
  const root = fs.realpathSync(path.resolve(import.meta.dirname, '../..'));
  const role = name => ({
    role: name,
    requiredFiles: Object.freeze([`scripts/ci/${name}-entry.mjs`]),
    files: Object.freeze({
      [`scripts/ci/${name}-entry.mjs`]: Object.freeze({ sha256: name.repeat(64).slice(0, 64) }),
    }),
    builtins: Object.freeze(['node:fs']),
  });
  const state = {
    imageHandle: Object.freeze({ image: true }),
    image: Object.freeze({
      root,
      eventDigest: 'event-digest',
      policyDigest: 'policy-digest',
      imageDigest: 'image-digest',
      contractDigest: 'contract-digest',
      preloadDigest: 'preload-digest',
      hostedLinuxQualified: false,
      node: Object.freeze({
        version: 'v24.15.0',
        platform: 'darwin',
        arch: 'arm64',
        executableSha256: 'node-digest',
        qualification: 'LOCAL_MECHANISM_ONLY',
        executable: '/private/executable-must-not-escape',
      }),
      roles: Object.freeze({ prior: role('prior'), graph: role('graph') }),
    }),
    launchAuthority: Object.freeze({ authority: true }),
    launches: new WeakMap(),
    create(authority, owner, roleName, index, binding) {
      assert.equal(authority, state.launchAuthority);
      const handle = Object.freeze({ launch: true });
      const launch = Object.freeze({
        role: roleName,
        index,
        complete: true,
        inspection: Object.freeze({
          role: roleName,
          index,
          loadedFiles: Object.freeze([`scripts/ci/${roleName}-entry.mjs`]),
          fileCount: 1,
          filesDigest: `${roleName}-${index}-files`,
          builtinDigest: `${roleName}-${index}-builtins`,
          resolveCount: 3 + index,
          loadCount: 2 + index,
          actualSetEqualsContract: true,
        }),
      });
      state.launches.set(handle, launch);
      return handle;
    },
    complete(authority, handle) {
      assert.equal(authority, state.launchAuthority);
      return state.launches.get(handle)?.complete === true;
    },
    inspection(authority, handle, roleName, index) {
      assert.equal(authority, state.launchAuthority);
      const launch = state.launches.get(handle);
      assert.equal(launch?.role, roleName);
      assert.equal(launch?.index, index);
      return launch.inspection;
    },
  };
  globalThis[key] = state;
  const value = `globalThis[${JSON.stringify(key)}]`;
  const modules = {
    'db-access-m4-worker-loader-image.mjs': `export const openM4WorkerLoaderImage=()=>${value}.imageHandle;export const inspectOwnedM4WorkerLoaderImage=()=>${value}.image;export const assertM4WorkerLoaderImage=()=>{};`,
    'db-access-m4-worker-loader-launch.mjs': `export const openM4WorkerLoaderLaunchAuthority=()=>${value}.launchAuthority;export const createM4WorkerLoaderLaunch=${value}.create;export const workerForM4LoaderLaunch=()=>({});export const bindingForM4LoaderLaunch=()=>({});export const isM4LoaderControlMessage=()=>false;export const sealM4WorkerLoads=()=>{};export const releaseM4PriorWorker=()=>{};export const noteM4GraphWorkerDone=()=>{};export const completeM4WorkerLoaderLaunch=()=>{};export const isM4WorkerLoaderLaunchComplete=${value}.complete;export const inspectCompletedM4WorkerLoaderLaunch=${value}.inspection;export const abortM4WorkerLoaderLaunch=async()=>{};`,
  };
  let source = fs.readFileSync(
    new URL('./db-access-m4-worker-loader-authority.mjs', import.meta.url),
    'utf8'
  );
  for (const [name, replacement] of Object.entries(modules)) {
    const before = `'./${name}'`;
    assert.equal(source.split(before).length, 2);
    source = source.replace(before, JSON.stringify(data(replacement)));
  }
  source = source.replace(
    /from '\.\/([^']+)'/gu,
    (_, name) => `from '${new URL(name, import.meta.url).href}'`
  );
  const api = await import(data(source + `\n//# sourceURL=${key}.mjs`));
  return {
    api,
    root,
    cleanup() {
      delete globalThis[key];
    },
  };
}

test('loader proof inspection is finite data-only evidence for one prior and four graph slots', async () => {
  const f = await fixture();
  try {
    const event = { gitDir: f.root, context: { id: 'unit' } };
    const session = f.api.openM4WorkerLoaderSession({
      candidate: f.root,
      producer: f.root,
      event,
    });
    f.api.assertM4WorkerLoaderSessionCurrent(session, { candidate: f.root, event });
    assert.throws(
      () =>
        f.api.assertM4WorkerLoaderSessionCurrent(session, {
          candidate: f.root,
          event: { ...event, context: { id: 'foreign' } },
        }),
      /foreign candidate\/event session/u
    );
    f.api.launchM4PriorWorker(session, {
      repoRoot: f.root,
      event,
      binding: 'a'.repeat(64),
    });
    for (let index = 0; index < 4; index++)
      f.api.launchM4GraphWorker(session, { repoRoot: f.root, index });
    const proof = f.api.finishM4WorkerLoaderSession(session);
    const inspection = f.api.inspectM4WorkerLoaderProof(proof);
    assert.deepEqual(
      f.api.assertM4WorkerLoaderProofCurrent(proof, { producer: f.root, event }),
      inspection
    );
    assert.ok(Object.isFrozen(inspection));
    assert.deepEqual(inspection.cardinality, {
      priorWorkers: 1,
      graphWorkers: 4,
      workers: 5,
    });
    assert.deepEqual(
      inspection.slots.map(slot => [slot.role, slot.index]),
      [
        ['prior', 0],
        ['graph', 0],
        ['graph', 1],
        ['graph', 2],
        ['graph', 3],
      ]
    );
    assert.equal(inspection.scope, 'LOADER_ONLY_LOCAL');
    assert.equal(inspection.hostedLinuxQualified, false);
    assert.equal(inspection.node.executable, undefined);
    assert.equal(
      inspection.slots.every(slot => slot.loadedFiles.length === 1),
      true
    );
    assert.equal(JSON.stringify(inspection).includes('binding'), false);
    assert.equal(JSON.stringify(inspection).includes('nonce'), false);
    assert.equal(JSON.stringify(inspection).includes('launchId'), false);
    assert.throws(
      () => f.api.inspectM4WorkerLoaderProof(structuredClone(proof)),
      /foreign loader proof/u
    );
  } finally {
    f.cleanup();
  }
});

test('launch state inspection requires the private per-instance authority handle', async () => {
  const api = await import('./db-access-m4-worker-loader-launch.mjs');
  assert.equal(api.inspectM4WorkerLoaderLaunch, undefined);
  assert.equal(typeof api.openM4WorkerLoaderLaunchAuthority, 'function');
  const first = api.openM4WorkerLoaderLaunchAuthority();
  const second = api.openM4WorkerLoaderLaunchAuthority();
  assert.notEqual(first, second);
  const foreignLaunch = Object.freeze({ version: 1 });
  assert.throws(
    () => api.isM4WorkerLoaderLaunchComplete(first, foreignLaunch),
    /foreign or aborted launch/u
  );
  assert.throws(
    () => api.isM4WorkerLoaderLaunchComplete(second, foreignLaunch),
    /foreign or aborted launch/u
  );
});

test('producer-seal helper exposes no evidence registration or marking surface', async () => {
  const api = await import('./db-access-m4-worker-evidence.mjs');
  assert.equal(typeof api.currentM4ProducerSeal, 'function');
  for (const name of [
    'markReceivedM4WorkerOutput',
    'registerM4WorkerEvidence',
    'shapeM4WorkerResults',
    'isOwnedM4WorkerEvidence',
    'claimOwnedM4WorkerEvidence',
    'assertM4WorkerEvidenceCurrent',
  ])
    assert.equal(api[name], undefined, `${name} must remain pool-private`);
});
