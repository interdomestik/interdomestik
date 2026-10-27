import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  opsRoot,
  command,
  operationId,
  observation,
} from './db-access-m4-mounted-relay.test-fixture.mjs';
import { relayIO, ownerConfiguration, tls } from './db-access-m4-mounted-relay-io.fixture.mjs';
test('actual fixed owner/relay dispatch and lifecycle with explicit no-network runtime doubles', async t => {
  const f = await relayIO(),
    owner = await f.load(opsRoot + 'm4-assignment-owner.ts');
  let handle;
  try {
    handle = await owner.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
    await t.test(
      'three literal profile paths and ops execute actual HTTPSclient/handler bodies',
      async () => {
        for (const [method, profile] of [
          ['executeLegacyAdmin', 'legacy-admin'],
          ['executeLegacyAgent', 'legacy-agent'],
          ['executeStaff', 'staff'],
          ['execute', 'ops'],
        ]) {
          const result = await handle[method]('original-cookie', command(profile), observation);
          assert.equal(result.status, 'completed');
          assert.equal(result.operationId, operationId);
          assert.equal(f.state.calls.at(-1).method, method);
          assert.equal(f.state.calls.at(-1).args[0], 'original-cookie');
          assert.equal(f.state.requests.at(-1).url, handle.origin + '/m4/assignment/' + profile);
        }
        assert.deepEqual(f.state.constructors, ['local']);
        assert(Object.isFrozen(handle));
        assert(Object.isFrozen(handle.clientConfiguration));
        assert.equal('runtime' in handle, false);
      }
    );
    await t.test('foreign/copy/premature take cannot mint owner observations', () => {
      assert.throws(() => owner.takeM4OwnedAssignmentOwnerContexts({ ...handle }), /owner/);
      assert.throws(() => owner.takeM4OwnedAssignmentOwnerContexts(handle), /closed/);
    });
    await t.test(
      'close retires half-open pre-HTTP socket and take uses original runtime owner once',
      async () => {
        const socket = f.state.servers[0].connect();
        await handle.close();
        assert.equal(socket.destroyed, true);
        const before = f.state.requests.length;
        assert.deepEqual(await handle.executeLegacyAdmin('cookie', command(), observation), {
          status: 'indeterminate',
          operationId,
        });
        assert.deepEqual(await handle.executeLegacyAdmin('cookie', '{', observation), {
          status: 'denied',
          reason: 'INVALID_REQUEST',
        });
        assert.deepEqual(await handle.executeStaff('cookie', command(), observation), {
          status: 'denied',
          reason: 'INVALID_REQUEST',
        });
        assert.deepEqual(await handle.executeLegacyAdmin('cookie', command(), '{}'), {
          status: 'denied',
          reason: 'INVALID_REQUEST',
        });
        assert.equal(f.state.requests.length, before);
        const result = owner.takeM4OwnedAssignmentOwnerContexts(handle);
        assert.equal(result.transport.rows.length, 4);
        for (const row of result.transport.rows) {
          assert.match(row.requestDigest, /^[a-f0-9]{64}$/);
          assert.match(row.responseDigest, /^[a-f0-9]{64}$/);
          assert.equal(row.delivery, 'finished');
        }
        assert.equal(f.state.runtimes[0].record.taken, true);
        assert.throws(() => owner.takeM4OwnedAssignmentOwnerContexts(handle), /owner/);
      }
    );
    await t.test(
      'production constructor remains literal and cannot create local proof owner',
      async () => {
        const prod = await owner.startM4PrivateAssignmentOwner({
          ...ownerConfiguration,
          port: 43499,
        });
        assert.equal(f.state.constructors.at(-1), 'production');
        const client = await f.load(opsRoot + 'm4-assignment-relay-client.ts');
        for (let i = 0; i < 129; i++)
          assert.equal(
            (
              await client.relayM4AssignmentRequest(
                { origin: prod.origin, ca: tls.cert, deadlineMs: 1000 },
                'legacy-admin',
                'cookie',
                command(),
                observation
              )
            ).status,
            'completed'
          );

        await prod.close();
        assert.throws(() => owner.takeM4OwnedAssignmentOwnerContexts(prod), /owner/);
      }
    );
    await t.test(
      'runtime and in-flight HTTP drain happen concurrently; blocked work remains owned',
      async () => {
        const h = await owner.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
        f.state.blocked = true;
        f.state.events = [];
        const call = h.executeLegacyAgent('cookie', command(), observation);
        for (let i = 0; i < 20 && !f.state.calls.at(-1)?.args; i++)
          await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        const close = h.close();
        await close;
        const result = await call;
        assert.equal(result.status, 'indeterminate');
        assert.equal(result.operationId, operationId);
        assert(f.state.events.includes('runtime-close'));
        const rows = owner.takeM4OwnedAssignmentOwnerContexts(h).transport.rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].outcome, 'indeterminate');
        f.state.blocked = false;
      }
    );
    await t.test(
      'facade owns a client before listener admission and drains it before take',
      async () => {
        const h = await owner.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
        f.state.mode = 'drip';
        const before = f.state.calls.length;
        const call = h.executeLegacyAdmin('cookie', command(), observation);
        let settled = false;
        void call.then(() => {
          settled = true;
        });
        await h.close();
        assert.equal(settled, true);
        assert.deepEqual(await call, { status: 'indeterminate', operationId });
        assert.equal(f.state.calls.length, before);
        assert.equal(owner.takeM4OwnedAssignmentOwnerContexts(h).transport.rows.length, 0);
        f.state.mode = 'bridge';
      }
    );
    await t.test('failed runtime drain is terminal before take', async () => {
      const h = await owner.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
      f.state.closeFails = true;
      await assert.rejects(h.close(), /drain/);
      assert.throws(() => owner.takeM4OwnedAssignmentOwnerContexts(h), /drained/);
      f.state.closeFails = false;
    });
  } finally {
    await handle?.close().catch(() => {});
    f.close();
  }
});
