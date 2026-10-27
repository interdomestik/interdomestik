// Actual driver body with an explicit fake compiled API: protocol/lifetime only, no TLS/SQL proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
const immediate = () => new Promise(resolve => setImmediate(resolve));
async function fixture() {
  const key = 'm4-mounted-driver-unit-' + randomUUID();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm4-mounted-driver-unit-'));
  fs.mkdirSync(path.join(root, 'results'));
  const previous = process.cwd();
  process.chdir(root);
  let release,
    closed = false,
    adapterCalls = 0;
  const waiting = new Promise(resolve => {
    release = resolve;
  });
  const operationId = '11111111-1111-4111-8111-111111111111';
  const owner = Object.freeze({
    origin: 'https://127.0.0.1:12345',
    clientConfiguration: Object.freeze({
      origin: 'https://127.0.0.1:12345',
      ca: 'unit-cert',
      deadlineMs: 12000,
    }),
    close() {
      closed = true;
      return Promise.resolve();
    },
    execute: async () => {},
    executeLegacyAdmin: async () => {},
    executeLegacyAgent: async () => {},
    executeStaff: async () => {},
  });
  const api = {
    startM4LocalQualificationAssignmentOwner: async () => owner,
    async executeMountedM4AdminAdapter(params) {
      adapterCalls++;
      assert.equal(params.operationId, operationId);
      assert.equal(process.env.M4_ASSIGNMENT_OWNER_ORIGIN, owner.origin);
      assert.equal(fs.readFileSync(process.env.M4_ASSIGNMENT_OWNER_CA_FILE, 'utf8'), 'unit-cert');
      await waiting;
      return { success: true };
    },
    takeM4CacheCalls: () => [],
    takeM4OwnedAssignmentOwnerContexts(value) {
      assert.equal(value, owner);
      assert.equal(closed, true);
      return {
        version: 1,
        localQualificationOnly: true,
        contexts: { version: 1, localQualificationOnly: true, rows: [] },
        transport: {
          rows: [
            {
              profile: 'legacy-admin',
              path: '/m4/assignment/legacy-admin',
              operationId,
              requestDigest: 'a'.repeat(64),
              responseDigest: 'b'.repeat(64),
              outcome: 'completed',
              delivery: 'finished',
            },
          ],
        },
      };
    },
  };
  globalThis[key] = api;
  let source = fs.readFileSync(
    new URL('./db-access-m4-runtime-mounted-child.mjs', import.meta.url),
    'utf8'
  );
  const original = "const api = createRequire(import.meta.url)('./m4-runtime.cjs');";
  assert.equal(source.split(original).length, 2);
  source = source.replace(original, () => 'const api = globalThis[' + JSON.stringify(key) + '];');
  const body = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
  const runtime = await body.createM4MountedFixtureRuntime(
    1,
    { operationDeadlineMs: 1000 },
    { key: 'unit-key', cert: 'unit-cert', ca: 'unit-cert' }
  );
  return {
    body,
    runtime,
    release,
    operationId,
    root,
    owner,
    isClosed: () => closed,
    adapterCalls: () => adapterCalls,
    cleanup() {
      process.chdir(previous);
      delete globalThis[key];
      fs.rmSync(root, { recursive: true });
    },
  };
}
test('actual adapter SDK promise remains owned across close, with post-close admission refused', async () => {
  const f = await fixture();
  const names = [
    'M4_ASSIGNMENT_OWNER_ORIGIN',
    'M4_ASSIGNMENT_OWNER_CA_FILE',
    'M4_ASSIGNMENT_RELAY_DEADLINE_MS',
  ];
  const before = names.map(name => process.env[name]);
  try {
    const running = f.body.invokeM4MountedFixtureAdapter(f.runtime, 'legacy-admin', {
      claimId: 'unit-claim',
      staffId: 'unit-staff',
      cookie: 'unit-cookie',
      operationId: f.operationId,
    });
    assert.equal(f.adapterCalls(), 1);
    assert.throws(
      () =>
        f.body.invokeM4MountedFixtureAdapter(f.runtime, 'legacy-agent', {
          claimId: 'unit-claim',
          cookie: 'unit-cookie',
          operationId: f.operationId,
        }),
      /refused/u
    );
    assert.equal(process.env.M4_ASSIGNMENT_OWNER_ORIGIN, f.owner.origin);
    let settled = false;
    const closing = f.runtime.close().then(() => {
      settled = true;
    });
    assert.equal(f.isClosed(), true);
    await immediate();
    assert.equal(settled, false);
    assert.throws(() => f.body.takeM4MountedFixtureRuntime(f.runtime), /refused/u);
    assert.throws(
      () =>
        f.body.invokeM4MountedFixtureAdapter(f.runtime, 'legacy-admin', {
          claimId: 'unit-claim',
          cookie: 'unit-cookie',
          operationId: f.operationId,
        }),
      /refused/u
    );
    assert.equal(f.adapterCalls(), 1);
    f.release();
    assert.equal((await running).result.success, true);
    await closing;
    const projection = f.body.takeM4MountedFixtureRuntime(f.runtime);
    assert.equal(projection.cases[0].responseProvenance, 'owned-server');
    assert.equal(projection.cases[0].operationId, f.operationId);
    assert.throws(() => f.body.takeM4MountedFixtureRuntime(f.runtime), /refused/u);
    assert.deepEqual(
      names.map(name => process.env[name]),
      before
    );
    assert.deepEqual(fs.readdirSync(path.join(f.root, 'results')), []);
  } finally {
    f.release();
    await f.runtime.close();
    f.cleanup();
  }
});
