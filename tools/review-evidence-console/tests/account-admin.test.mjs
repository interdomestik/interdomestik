import assert from 'node:assert/strict';
import test from 'node:test';

import { mutateAccounts, registryFingerprint } from '../server/admin/account-mutations.mjs';
import { parseAdminArgs } from '../scripts/account-admin.mjs';

const encoded = size => Buffer.alloc(size, 7).toString('base64url');
const password = { algorithm: 'PBKDF2-SHA256', iterations: 600_000, salt: encoded(24), hash: encoded(32) };
const gazmend = {
  id: 'acct_gazmend', username: 'gazmend', displayName: 'Gazmend Abazi', role: 'governance',
  fixtureId: 'reviewer_governance_mk', disabled: false, sessionVersion: 1, password,
};

test('dry-run is the default and apply requires a compare-and-swap fingerprint', () => {
  assert.deepEqual(parseAdminArgs(['disable', '--username', 'gazmend']), {
    action: 'disable', username: 'gazmend', apply: false, expectedFingerprint: undefined,
  });
  assert.throws(() => parseAdminArgs(['disable', '--username', 'gazmend', '--apply']), /fingerprint/u);
});

test('add, rotate, disable, and invalidate preserve immutable account identity', () => {
  const added = mutateAccounts([gazmend], { action: 'add', account: {
    ...gazmend, id: 'acct_sanja', username: 'sanja', displayName: 'Sanja Jovanovska',
    role: 'legal_privacy', fixtureId: 'reviewer_legal_privacy_mk',
    password: { ...password, salt: Buffer.alloc(24, 8).toString('base64url') },
  } });
  assert.equal(added.length, 2);
  const rotated = mutateAccounts([gazmend], { action: 'rotate', username: 'gazmend', password: { ...password, hash: encoded(32).replace(/^B/u, 'C') } });
  assert.notEqual(rotated[0].password, password);
  assert.equal(rotated[0].id, gazmend.id);
  assert.equal(mutateAccounts([gazmend], { action: 'disable', username: 'gazmend' })[0].disabled, true);
  assert.equal(mutateAccounts([gazmend], { action: 'invalidate', username: 'gazmend' })[0].sessionVersion, 2);
});

test('fingerprints are deterministic and password input is stdin-only', () => {
  assert.equal(registryFingerprint([gazmend]), registryFingerprint([{ ...gazmend }]));
  assert.throws(() => parseAdminArgs(['rotate', '--username', 'gazmend', '--password', 'secret']), /stdin/u);
  assert.equal(parseAdminArgs(['rotate', '--username', 'gazmend', '--password-stdin']).passwordStdin, true);
});

test('check validates the complete registry instead of fingerprinting malformed JSON', async () => {
  const { runAdmin } = await import('../scripts/account-admin.mjs');
  await assert.rejects(() => runAdmin(['check'], { REVIEW_PORTAL_ACCOUNTS_JSON: '[{"id":"x"}]' }));
});
