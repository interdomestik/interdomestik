import assert from 'node:assert/strict';
import test from 'node:test';

import * as serverApp from '../server/app.mjs';

const encoded = size => Buffer.alloc(size, 7).toString('base64url');
const account = (overrides = {}) => ({
  id: 'acct_gazmend',
  username: ' Gazmend ',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 1,
  password: {
    algorithm: 'PBKDF2-SHA256',
    iterations: 600_000,
    salt: encoded(16),
    hash: encoded(32),
  },
  ...overrides,
});

test('registry normalizes usernames and freezes valid named accounts', () => {
  assert.equal(typeof serverApp.parseAccountRegistry, 'function');
  const registry = serverApp.parseAccountRegistry(JSON.stringify([account()]));
  assert.equal(registry.byUsername.get('gazmend').id, 'acct_gazmend');
  assert.equal(registry.byId.get('acct_gazmend').fixtureId, 'reviewer_governance_mk');
  assert.equal(Object.isFrozen(registry.byId.get('acct_gazmend')), true);
});

test('registry rejects duplicate immutable identities and malformed credentials', () => {
  assert.equal(typeof serverApp.parseAccountRegistry, 'function');
  const invalidRows = [
    [account(), account({ id: 'acct_other', username: 'GAZMEND' })],
    [account(), account({ id: 'acct_gazmend', username: 'other' })],
    [account(), account({ id: 'acct_other', username: 'other' })],
    [account({ username: 'not valid' })],
    [account({ role: 'admin' })],
    [account({ sessionVersion: -1 })],
    [account({ password: { ...account().password, iterations: 599_999 } })],
    [account({ password: { ...account().password, salt: encoded(15) } })],
    [account({ password: { ...account().password, hash: encoded(31) } })],
    [account(), account({ id: 'acct_other', username: 'other', fixtureId: 'reviewer_other' })],
  ];
  for (const rows of invalidRows) {
    assert.throws(() => serverApp.parseAccountRegistry(JSON.stringify(rows)));
  }
});

test('disabled accounts remain valid configuration', () => {
  const registry = serverApp.parseAccountRegistry(JSON.stringify([account({ disabled: true })]));
  assert.equal(registry.byUsername.get('gazmend').disabled, true);
});
