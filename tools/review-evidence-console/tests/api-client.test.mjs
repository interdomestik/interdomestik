import assert from 'node:assert/strict';
import test from 'node:test';

import { PortalApiError, createApiClient } from '../public/src/data/api-client.mjs';

function response(status, value) {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: value === undefined ? {} : { 'content-type': 'application/json' },
  });
}

test('API client uses same-origin credentials and server-derived reviewer context', async () => {
  const calls = [];
  const fetchImpl = async (path, options) => {
    calls.push([path, options]);
    if (path === '/api/session') {
      return response(200, {
        displayName: 'Gazmend Abazi',
        role: 'governance',
        fixtureId: 'reviewer_governance_mk',
      });
    }
    if (path === '/api/assignments') return response(200, [{ id: 'assigned' }]);
    return response(200, { assignment: { id: 'assigned' } });
  };
  const client = createApiClient({ fetchImpl });
  assert.equal((await client.session()).fixtureId, 'reviewer_governance_mk');
  assert.deepEqual(await client.listAssignments(), [{ id: 'assigned' }]);
  assert.equal((await client.loadAssignment('assigned')).assignment.id, 'assigned');
  assert.deepEqual(
    calls.map(([path, options]) => [path, options.credentials, options.method]),
    [
      ['/api/session', 'same-origin', 'GET'],
      ['/api/assignments', 'same-origin', 'GET'],
      ['/api/assignments/assigned', 'same-origin', 'GET'],
    ]
  );
});

test('API client emits typed errors that the UI can handle explicitly', async () => {
  const cases = [
    [401, 'session_expired'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
  ];
  for (const [status, code] of cases) {
    const client = createApiClient({ fetchImpl: async () => response(status, { code: 'hidden' }) });
    await assert.rejects(client.session(), error => {
      assert.equal(error instanceof PortalApiError, true);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      return true;
    });
  }
});

test('login and logout send bounded JSON without a reviewer identity field', async () => {
  const calls = [];
  const client = createApiClient({
    fetchImpl: async (path, options) => {
      calls.push([path, options]);
      return path.endsWith('logout') ? response(204) : response(200, { role: 'governance' });
    },
  });
  await client.login({ username: 'gazmend', password: 'secret' });
  await client.logout();
  assert.deepEqual(JSON.parse(calls[0][1].body), { username: 'gazmend', password: 'secret' });
  assert.equal(calls[0][1].credentials, 'same-origin');
  assert.equal(calls[1][0], '/api/session/logout');
});

test('receipt client submits judgments and fetches only public verification keys', async () => {
  const calls = [];
  const receipt = { receiptId: 'rec_0123456789abcdef01234567', attestation: { keyId: 'test' } };
  const keys = { version: 1, algorithm: 'Ed25519', keys: [] };
  const client = createApiClient({
    fetchImpl: async (path, options) => {
      calls.push([path, options]);
      return response(200, path.endsWith('/keys') ? keys : receipt);
    },
  });
  const judgments = {
    assignmentId: 'assign_mob03a_part_a',
    decisions: { ITEM: { decision: 'approve' } },
    structuredResponses: { ITEM: {} },
    safeEvidenceConfirmed: true,
  };
  assert.deepEqual(await client.submitReceipt(judgments), receipt);
  assert.deepEqual(await client.receiptKeys(), keys);
  assert.deepEqual(
    await client.correctReceipt({ ...judgments, previousReceipt: receipt }),
    receipt
  );
  assert.deepEqual(
    calls.map(([path, options]) => [
      path,
      options.method,
      options.body === undefined ? undefined : JSON.parse(options.body),
    ]),
    [
      ['/api/receipts', 'POST', judgments],
      ['/api/receipts/keys', 'GET', undefined],
      ['/api/receipts/correct', 'POST', { ...judgments, previousReceipt: receipt }],
    ]
  );
});
