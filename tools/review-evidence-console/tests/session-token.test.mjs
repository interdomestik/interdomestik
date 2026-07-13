import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

const secret = Buffer.alloc(32, 5).toString('base64url');
const account = Object.freeze({
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 4,
});
const registry = value => ({ byId: new Map([[value.id, Object.freeze(value)]]) });
const options = {
  secret,
  origin: 'https://reviewer.example.test',
  now: () => 1_800_000_000,
};

test('signed session resolves identity from the current registry', async () => {
  assert.equal(typeof serverApp.createSessionToken, 'function');
  const token = await serverApp.createSessionToken(account, options);
  const result = await serverApp.verifySessionToken(token, registry(account), options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.account, account);
  assert.equal(result.expiresAt, 1_800_028_800);
});

test('session rejects tamper, wrong origin, expiry, future issue, disable, and version drift', async () => {
  const token = await serverApp.createSessionToken(account, options);
  const cases = [
    [token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'), registry(account), options],
    [token, registry(account), { ...options, origin: 'https://other.example.test' }],
    [token, registry(account), { ...options, now: () => 1_800_028_801 }],
    [
      await serverApp.createSessionToken(account, { ...options, now: () => 1_800_000_100 }),
      registry(account),
      options,
    ],
    [token, registry({ ...account, disabled: true }), options],
    [token, registry({ ...account, sessionVersion: 5 }), options],
    [token, registry({ ...account, role: 'platform_guardian' }), options],
    [token, registry({ ...account, fixtureId: 'reviewer_platform_mk' }), options],
  ];
  for (const [candidate, accounts, verification] of cases) {
    assert.deepEqual(await serverApp.verifySessionToken(candidate, accounts, verification), {
      ok: false,
      code: 'invalid_session',
    });
  }
});

test('session refuses TTLs over eight hours and malformed secrets or tokens', async () => {
  await assert.rejects(() => serverApp.createSessionToken(account, { ...options, ttlSeconds: 28_801 }));
  await assert.rejects(() => serverApp.createSessionToken(account, { ...options, secret: 'short' }));
  for (const token of ['', 'one-part', 'a.b.c', `${'x'.repeat(5000)}.x`]) {
    assert.deepEqual(await serverApp.verifySessionToken(token, registry(account), options), {
      ok: false,
      code: 'invalid_session',
    });
  }
});
