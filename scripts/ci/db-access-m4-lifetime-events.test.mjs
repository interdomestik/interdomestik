import assert from 'node:assert/strict';
import { test } from 'node:test';
import { relayIO, ownerConfiguration } from './db-access-m4-mounted-relay-io.fixture.mjs';
import {
  opsRoot,
  operationId,
  command,
  observation,
} from './db-access-m4-mounted-relay.test-fixture.mjs';
const turn = () => new Promise(resolve => setImmediate(resolve));
test('actual lifetime barriers wait for delivered resource close events', async t => {
  await t.test(
    'request close before socket assignment cannot settle a still-open published private-agent socket',
    async () => {
      const f = await relayIO();
      try {
        f.state.mode = 'valid';
        f.state.holdClientClose = true;
        const api = await f.load(opsRoot + 'm4-assignment-relay-client.ts');
        let settled = false;
        const result = api
          .relayM4AssignmentRequest(
            { origin: 'https://owner.test', deadlineMs: 1000 },
            'legacy-admin',
            'cookie',
            command(),
            observation
          )
          .then(x => {
            settled = true;
            return x;
          });
        const req = f.state.requests[0].outgoing;
        await new Promise(resolve => req.once('close', resolve));
        await turn();
        assert.equal(settled, false);
        req.socket = req.unitSocket;
        req.emit('socket', req.socket);
        assert.equal(settled, false);
        req.unitSocket.releaseClose();
        assert.equal((await result).status, 'completed');
      } finally {
        f.close();
      }
    }
  );
  await t.test(
    'absolute deadline remains active after response EOF until physical retirement',
    async () => {
      const f = await relayIO();
      try {
        f.state.mode = 'valid';
        f.state.holdClientClose = true;
        const api = await f.load(opsRoot + 'm4-assignment-relay-client.ts');
        let settled = false;
        const result = api
          .relayM4AssignmentRequest(
            { origin: 'https://owner.test', deadlineMs: 20 },
            'legacy-admin',
            'cookie',
            command(),
            observation
          )
          .then(x => {
            settled = true;
            return x;
          });
        const req = f.state.requests[0].outgoing;
        await new Promise(resolve => req.once('close', resolve));
        await new Promise(resolve => setTimeout(resolve, 35));
        assert.equal(settled, false);
        req.unitSocket.releaseClose();
        assert.deepEqual(await result, { status: 'indeterminate', operationId });
      } finally {
        f.close();
      }
    }
  );
  await t.test(
    'server callback precedes raw close; every over-limit delivered socket is enrolled before destruction',
    async () => {
      const f = await relayIO();
      let h;
      try {
        f.state.holdServerClose = true;
        const api = await f.load(opsRoot + 'm4-assignment-owner.ts');
        h = await api.startM4LocalQualificationAssignmentOwner(ownerConfiguration);
        const server = f.state.servers[0],
          sockets = Array.from({ length: 17 }, () => server.connect());
        assert.equal(sockets[16].destroyed, true);
        let closed = false;
        const closing = h.close().then(() => {
          closed = true;
        });
        await turn();
        assert.equal(closed, false);
        assert.throws(() => api.takeM4OwnedAssignmentOwnerContexts(h), /closed/);
        for (let i = 0; i < 16; i++) sockets[i].releaseClose();
        await turn();
        assert.equal(closed, false);
        sockets[16].releaseClose();
        await closing;
        assert.equal(closed, true);
        api.takeM4OwnedAssignmentOwnerContexts(h);
      } finally {
        for (const server of f.state.servers)
          for (const socket of server.sockets) socket.releaseClose();
        await h?.close().catch(() => {});
        f.close();
      }
    }
  );
});
