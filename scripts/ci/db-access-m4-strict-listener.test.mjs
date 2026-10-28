import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { fixture, request, observation } from './db-access-m4-strict-observation.fixture.mjs';
async function dispatch(listener, body) {
  const req = Readable.from([Buffer.from(body)]);
  req.method = 'POST';
  req.url = '/m4/assignment/legacy-admin';
  req.headers = { 'content-type': 'application/json', cookie: 'cookie' };
  const response = new EventEmitter();
  response.destroyed = false;
  response.writeHead = () => response;
  response.end = bytes => {
    response.body = JSON.parse(bytes);
    response.emit('finish');
  };
  response.destroy = () => {
    response.destroyed = true;
    response.emit('close');
  };
  listener.server.handler(req, response);
  await Promise.all([...listener.work]);
  return response.body;
}
const envelope = () =>
  JSON.stringify({
    version: 1,
    request,
    observation,
    observationAuthority: 'untrusted-request-metadata',
  });

test('strict listener records actual dispatch tuple with local capture disabled', async () => {
  const f = fixture({ realHttp: true });
  const runtime = f.api.createM4ObservedPrivateAssignmentRuntime(f.config);
  const budget = { used: 0, refused: false };
  const listener = f.http.createM4AssignmentOwnerListener(runtime, {}, 2000, false, budget);
  const result = await dispatch(listener, envelope());
  assert.equal(result.status, 'completed');
  assert.equal(listener.rows.length, 1);
  assert.equal(listener.rows[0].delivery, 'finished');
  assert.equal(listener.rows[0].operationId, JSON.parse(request).operationId);
  assert.equal(budget.used, 1);
  await runtime.close();
  const row = f.api.takeM4StrictAssignmentContexts(runtime).rows[0];
  assert.equal(row.requestDigest, listener.rows[0].requestDigest);
  assert.equal(row.responseDigest, listener.rows[0].responseDigest);
});
test('strict transcript limit refuses without dispatch or affecting another owner', async () => {
  const f = fixture({ realHttp: true });
  const runtime = f.api.createM4ObservedPrivateAssignmentRuntime(f.config);
  const exhausted = { used: 2048, refused: false };
  const a = f.http.createM4AssignmentOwnerListener(runtime, {}, 2000, false, exhausted);
  assert.equal((await dispatch(a, envelope())).status, 'indeterminate');
  assert.equal(f.pools.length, 0);
  assert.equal(a.refused, true);
  const b = f.http.createM4AssignmentOwnerListener(runtime, {}, 2000, false, {
    used: 0,
    refused: false,
  });
  assert.equal((await dispatch(b, envelope())).status, 'completed');
  assert.equal(b.refused, false);
  await runtime.close();
});
test('local and strict capture budgets cannot mix; ordinary listener still has no capture', async () => {
  const f = fixture({ realHttp: true });
  const runtime = f.api.createM4PrivateAssignmentRuntime(f.config);
  assert.throws(
    () =>
      f.http.createM4AssignmentOwnerListener(runtime, {}, 2000, true, { used: 0, refused: false }),
    /cannot mix/
  );
  const listener = f.http.createM4AssignmentOwnerListener(runtime, {}, 2000, false);
  assert.equal((await dispatch(listener, envelope())).status, 'completed');
  assert.deepEqual(listener.rows, []);
  await runtime.close();
});
