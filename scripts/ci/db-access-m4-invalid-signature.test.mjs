import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import test from 'node:test';
import { invalidM4Signature } from './db-access-m4-invalid-signature.mjs';

const prefix = '__Secure-better-auth.session_token=';
test('signature control preserves token and parser shape while changing actual HMAC bytes', () => {
  const token = 'synthetic.token+/%=';
  const signature = createHmac('sha256', 'synthetic-fixture-only-secret')
    .update(token)
    .digest('base64');
  const cookie = prefix + encodeURIComponent(token + '.' + signature);
  const invalid = invalidM4Signature(cookie, token);
  const value = decodeURIComponent(invalid.slice(prefix.length));
  const changed = value.slice(value.lastIndexOf('.') + 1);
  assert.equal(value.slice(0, value.lastIndexOf('.')), token);
  assert.match(changed, /^[A-Za-z0-9+/]{43}=$/);
  assert.equal(changed.length, signature.length);
  assert.equal(
    timingSafeEqual(Buffer.from(changed, 'base64'), Buffer.from(signature, 'base64')),
    false
  );
  assert.equal(cookie, prefix + encodeURIComponent(token + '.' + signature));
});

test('first A and non-A signature branches both change decoded signature bytes', () => {
  for (const first of ['A', 'B', '/', '+']) {
    const signature = first + 'A'.repeat(42) + '=';
    const cookie = prefix + encodeURIComponent('token.' + signature);
    const changed = decodeURIComponent(
      invalidM4Signature(cookie, 'token').slice(prefix.length)
    ).slice(6);
    assert.equal(changed.slice(1), signature.slice(1));
    assert.notDeepEqual(Buffer.from(changed, 'base64'), Buffer.from(signature, 'base64'));
  }
});

test('unexpected cookie names, token mismatch and malformed signature controls refuse', () => {
  const valid = prefix + encodeURIComponent('token.' + 'A'.repeat(43) + '=');
  for (const [cookie, token] of [
    ['other=' + valid, 'token'],
    [valid, 'different'],
    [prefix + '%XX', 'token'],
    [prefix + 'token.short', 'token'],
    [prefix + encodeURIComponent('token.' + '*'.repeat(43) + '='), 'token'],
    [null, 'token'],
  ])
    assert.throws(() => invalidM4Signature(cookie, token));
});
