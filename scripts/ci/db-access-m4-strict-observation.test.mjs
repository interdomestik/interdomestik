import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, request, observation } from './db-access-m4-strict-observation.fixture.mjs';

test('actual named strict runtime retains observed invocation with strict TLS', async () => {
  const f = fixture();
  const runtime = f.api.createM4ObservedPrivateAssignmentRuntime(f.config);
  assert.deepEqual(Object.keys(runtime), [
    'execute',
    'close',
    'executeLegacyAdmin',
    'executeLegacyAgent',
    'executeStaff',
  ]);
  assert(Object.isFrozen(runtime));
  assert.throws(() => f.api.takeM4StrictAssignmentContexts(runtime), /closed|drained/);
  const result = await runtime.executeLegacyAdmin('cookie', request, observation);
  assert.equal(result.status, 'completed');
  assert.equal(f.pools.length, 2);
  assert(f.pools.every(pool => pool.options.ssl.rejectUnauthorized === true && pool.ended === 1));
  assert(f.modes.every(local => local === false));
  await runtime.close();
  const captured = f.api.takeM4StrictAssignmentContexts(runtime);
  assert.equal(captured.constructorName, 'createM4PrivateAssignmentRuntime');
  assert.equal(captured.loopbackQualification, false);
  assert.equal(captured.localQualificationOnly, false);
  assert.equal(captured.rows.length, 1);
  assert.equal(captured.rows[0].profile, 'legacy-admin');
  assert.equal(captured.rows[0].capturedAfterPosture, true);
  assert.match(captured.rows[0].responseDigest, /^[a-f0-9]{64}$/);
  assert.throws(() => f.api.takeM4StrictAssignmentContexts(runtime));
  assert.throws(() => f.api.takeM4OwnedAssignmentContexts(runtime));
});
test('plain strict runtime and cloned/serialized handles do not gain observation', async () => {
  const f = fixture();
  const ordinary = f.api.createM4PrivateAssignmentRuntime(f.config);
  await ordinary.close();
  assert.throws(() => f.api.takeM4StrictAssignmentContexts(ordinary));
  const actual = f.api.createM4ObservedPrivateAssignmentRuntime(f.config);
  await actual.close();
  assert.throws(() => f.api.takeM4StrictAssignmentContexts({ ...actual }));
  assert.throws(() => f.api.takeM4StrictAssignmentContexts(JSON.parse('{}')));
  assert.equal(f.api.takeM4StrictAssignmentContexts(actual).rows.length, 0);
});
test('local constructor keeps local identity and cannot satisfy strict take', async () => {
  const f = fixture();
  const runtime = f.api.createM4LocalQualificationAssignmentRuntime(f.config);
  await runtime.executeLegacyAgent('cookie', request, observation);
  await runtime.close();
  assert(f.pools.every(pool => pool.options.ssl === false));
  assert.throws(() => f.api.takeM4StrictAssignmentContexts(runtime));
  assert.equal(f.api.takeM4OwnedAssignmentContexts(runtime).localQualificationOnly, true);
});
test('strict owner survives source-owned config cloning and preserves public surface', async () => {
  const f = fixture();
  const owner = await f.owner.startM4ObservedPrivateAssignmentOwner(f.ownerConfig);
  assert.deepEqual(Object.keys(owner), ['origin', 'close']);
  assert(Object.isFrozen(owner));
  assert.throws(() => f.owner.takeM4StrictAssignmentOwnerContexts(owner), /closed|drained/);
  const listener = f.listeners[0];
  assert.equal(listener.local, false);
  assert(listener.strictBudget);
  await listener.runtime.executeLegacyAgent('cookie', request, observation);
  await owner.close();
  const taken = f.owner.takeM4StrictAssignmentOwnerContexts(owner);
  assert.equal(taken.constructorName, 'startM4PrivateAssignmentOwner');
  assert.equal(taken.loopbackQualification, false);
  assert.equal(taken.contexts.constructorName, 'createM4PrivateAssignmentRuntime');
  assert.equal(taken.contexts.rows.length, 1);
  assert(f.modes.every(local => local === false));
  assert.throws(() => f.owner.takeM4StrictAssignmentOwnerContexts(owner));
  assert.throws(() => f.owner.takeM4OwnedAssignmentOwnerContexts(owner));
});
test('unobserved strict owner is not registered and gets no transcript budget', async () => {
  const f = fixture();
  const owner = await f.owner.startM4PrivateAssignmentOwner(f.ownerConfig);
  assert.equal(f.listeners[0].strictBudget, undefined);
  await owner.close();
  assert.throws(() => f.owner.takeM4StrictAssignmentOwnerContexts(owner));
});
test('concurrent fixed observed owners bind only their own runtime and budget', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([
    f.owner.startM4ObservedPrivateAssignmentOwner(f.ownerConfig),
    f.owner.startM4ObservedPrivateAssignmentOwner(f.ownerConfig),
  ]);
  assert.notEqual(f.listeners[0].strictBudget, f.listeners[1].strictBudget);
  await f.listeners[0].runtime.executeLegacyAdmin('cookie', request, observation);
  await Promise.all([a.close(), b.close()]);
  assert.equal(f.owner.takeM4StrictAssignmentOwnerContexts(a).contexts.rows.length, 1);
  assert.equal(f.owner.takeM4StrictAssignmentOwnerContexts(b).contexts.rows.length, 0);
});
test('failed constructor registration cannot leak to later ordinary construction', async () => {
  const f = fixture();
  assert.throws(() =>
    f.api.createM4ObservedPrivateAssignmentRuntime({
      ...f.config,
      operationDeadlineMs: 0,
    })
  );
  const next = f.api.createM4PrivateAssignmentRuntime(f.config);
  await next.close();
  assert.throws(() => f.api.takeM4StrictAssignmentContexts(next));
});
