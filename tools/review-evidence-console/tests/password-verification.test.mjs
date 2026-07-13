import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

const salt = Buffer.alloc(16, 3);
const hash = Buffer.alloc(32, 9);
const record = {
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 1,
  password: {
    algorithm: 'PBKDF2-SHA256',
    iterations: 600_000,
    salt: salt.toString('base64url'),
    hash: hash.toString('base64url'),
  },
};

function registry(overrides = {}) {
  const account = Object.freeze({ ...record, ...overrides });
  return { byUsername: new Map([[account.username, account]]), dummy: record.password };
}

test('valid password returns the live enabled account', async () => {
  assert.equal(typeof serverApp.verifyPassword, 'function');
  const result = await serverApp.verifyPassword(registry(), ' GAZMEND ', 'correct', {
    deriveKey: async () => hash,
  });
  assert.equal(result.ok, true);
  assert.equal(result.account.id, 'acct_gazmend');
});

test('unknown, disabled, and wrong passwords execute identical derivation parameters', async () => {
  const calls = [];
  const deriveKey = async (password, currentSalt, iterations, keyLength) => {
    calls.push({ password, saltLength: currentSalt.length, iterations, keyLength });
    return Buffer.alloc(32, password === 'correct' ? 9 : 8);
  };
  const cases = [
    [registry(), 'unknown', 'wrong'],
    [registry({ disabled: true }), 'gazmend', 'correct'],
    [registry(), 'gazmend', 'wrong'],
  ];
  for (const [accounts, username, password] of cases) {
    const result = await serverApp.verifyPassword(accounts, username, password, { deriveKey });
    assert.deepEqual(result, { ok: false, code: 'invalid_credentials' });
  }
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map(({ saltLength, iterations, keyLength }) => ({ saltLength, iterations, keyLength })),
    Array(3).fill({ saltLength: 16, iterations: 600_000, keyLength: 32 })
  );
});

test('password verification rejects inputs over 256 bytes before derivation', async () => {
  let calls = 0;
  const result = await serverApp.verifyPassword(registry(), 'gazmend', 'x'.repeat(257), {
    deriveKey: async () => {
      calls += 1;
      return hash;
    },
  });
  assert.deepEqual(result, { ok: false, code: 'invalid_credentials' });
  assert.equal(calls, 0);
});
