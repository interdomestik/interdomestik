import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

const origin = 'https://reviewer.example.test';
const secret = Buffer.alloc(32, 4).toString('base64url');
const account = Object.freeze({
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 1,
});

function request(path, { method = 'GET', body, cookie, suppliedOrigin = origin, sourceIp } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (suppliedOrigin) headers.set('origin', suppliedOrigin);
  if (sourceIp) headers.set('x-vercel-forwarded-for', sourceIp);
  return new Request(origin + path, { method, headers, body });
}

function setup({ allowed = true } = {}) {
  let verifications = 0;
  const handler = serverApp.createPortalHandler({
    registry: { byId: new Map([[account.id, account]]) },
    sessionSecret: secret,
    now: () => 1_800_000_000,
    limiter: { consume: () => ({ allowed, retryAfter: 60 }) },
    verifyCredentials: async (_registry, username, password) => {
      verifications += 1;
      return username === 'gazmend' && password === 'correct'
        ? { ok: true, account }
        : { ok: false, code: 'invalid_credentials' };
    },
    fixtureService: { listAssignments: async () => ({ ok: true, value: [] }) },
  });
  return { handler, verifications: () => verifications };
}

test('login, session probe, and logout use a secure private session', async () => {
  assert.equal(typeof serverApp.createPortalHandler, 'function');
  const { handler } = setup();
  const login = await handler(
    request('/api/session/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'gazmend', password: 'correct' }),
    })
  );
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('cache-control'), 'private, no-store');
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const loginBody = await login.json();
  assert.deepEqual(
    { ...loginBody, draftScope: '<opaque>' },
    {
      displayName: 'Gazmend Abazi',
      role: 'governance',
      fixtureId: 'reviewer_governance_mk',
      draftScope: '<opaque>',
      sessionExpiresAt: 1_800_028_800,
    }
  );
  assert.match(loginBody.draftScope, /^draft_[A-Za-z0-9_-]+$/u);

  const probe = await handler(request('/api/session', { cookie }));
  assert.equal(probe.status, 200);
  assert.equal(probe.headers.get('cache-control'), 'private, no-store');
  const logout = await handler(request('/api/session/logout', { method: 'POST', cookie }));
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('auth failures are generic and mutation boundaries fail closed', async () => {
  const { handler } = setup();
  const wrong = await handler(
    request('/api/session/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'gazmend', password: 'wrong' }),
    })
  );
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { code: 'authentication_failed' });
  assert.equal((await handler(request('/api/session'))).status, 401);
  assert.equal(
    (
      await handler(
        request('/api/session/login', {
          method: 'POST',
          suppliedOrigin: 'https://other.example.test',
          body: '{}',
        })
      )
    ).status,
    403
  );
  assert.equal((await handler(request('/api/session/login', { method: 'PUT' }))).status, 405);
  assert.equal(
    (
      await handler(
        request('/api/session/login', {
          method: 'POST',
          body: JSON.stringify({ x: 'x'.repeat(9000) }),
        })
      )
    ).status,
    413
  );
});

test('rate limit returns retry guidance before password verification', async () => {
  const { handler, verifications } = setup({ allowed: false });
  const response = await handler(
    request('/api/session/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'gazmend', password: 'correct' }),
    })
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(verifications(), 0);
});

test('default handler throttles the sixth login attempt from one source', async () => {
  let verifications = 0;
  const handler = serverApp.createPortalHandler({
    registry: { byId: new Map([[account.id, account]]) },
    sessionSecret: secret,
    fixtureService: {},
    verifyCredentials: async () => {
      verifications += 1;
      return { ok: false, code: 'invalid_credentials' };
    },
  });
  const loginRequest = () =>
    request('/api/session/login', {
      method: 'POST',
      sourceIp: '203.0.113.10',
      body: JSON.stringify({ username: 'gazmend', password: 'wrong' }),
    });
  const statuses = [];
  for (let attempt = 0; attempt < 6; attempt += 1)
    statuses.push((await handler(loginRequest())).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
  assert.equal(verifications, 5);
});
