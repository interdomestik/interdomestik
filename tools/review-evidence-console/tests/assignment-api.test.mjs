import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

const origin = 'https://reviewer.example.test';
const secret = Buffer.alloc(32, 6).toString('base64url');
const account = Object.freeze({
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 2,
});

async function setup() {
  const token = await serverApp.createSessionToken(account, {
    secret,
    origin,
    now: () => 1_800_000_000,
  });
  const calls = [];
  const handler = serverApp.createPortalHandler({
    registry: { byId: new Map([[account.id, account]]) },
    sessionSecret: secret,
    now: () => 1_800_000_000,
    fixtureService: {
      listAssignments: async live => {
        calls.push(['list', live.id]);
        return { ok: true, value: [{ id: 'assigned' }] };
      },
      loadAssignment: async (live, id) => {
        calls.push(['load', live.id, id]);
        return id === 'assigned'
          ? { ok: true, value: { assignment: { id }, reviewer: { role: live.role } } }
          : { ok: false, code: 'not_found', message: 'Detyra nuk u gjet.' };
      },
    },
  });
  const get = path =>
    handler(
      new Request(origin + path, {
        headers: { cookie: `review_portal_session=${token}` },
      })
    );
  return { calls, get };
}

test('assignment API derives list and bundle access from the signed session', async () => {
  const { calls, get } = await setup();
  const list = await get('/api/assignments');
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), [{ id: 'assigned' }]);
  const bundle = await get('/api/assignments/assigned');
  assert.equal(bundle.status, 200);
  assert.equal((await bundle.json()).assignment.id, 'assigned');
  assert.deepEqual(calls, [
    ['list', 'acct_gazmend'],
    ['load', 'acct_gazmend', 'assigned'],
  ]);
});

test('assignment API returns non-reflective 404 for cross-account paths', async () => {
  const { get } = await setup();
  const response = await get('/api/assignments/private-other-account');
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { code: 'not_found' });
});
