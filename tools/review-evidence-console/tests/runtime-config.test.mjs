import assert from 'node:assert/strict';
import test from 'node:test';

import { fingerprintPublicKey } from '../server/receipts/keyring.mjs';
import { createEnvironmentPortalHandler, createPortalHandlerFromEnv } from '../server/runtime.mjs';

async function environment() {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const publicKey = Buffer.from(await crypto.subtle.exportKey('spki', pair.publicKey));
  const keyId = 'rec_test_01';
  return {
    REVIEW_PORTAL_ACCOUNTS_JSON: JSON.stringify([
      {
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
          salt: Buffer.alloc(16, 1).toString('base64url'),
          hash: Buffer.alloc(32, 2).toString('base64url'),
        },
      },
    ]),
    REVIEW_PORTAL_SESSION_SECRET: Buffer.alloc(32, 3).toString('base64url'),
    REVIEW_PORTAL_RECEIPT_PRIVATE_KEY: privateKey.toString('base64url'),
    REVIEW_PORTAL_RECEIPT_KEYS_JSON: JSON.stringify({
      activeKeyId: keyId,
      publicKeys: [
        {
          id: keyId,
          publicKeySpki: publicKey.toString('base64url'),
          fingerprint: await fingerprintPublicKey(publicKey),
        },
      ],
    }),
  };
}

test('complete environment creates a private API handler with receipt keys', async () => {
  const handler = await createPortalHandlerFromEnv(await environment());
  const response = await handler(new Request('https://reviewer.example.test/api/session'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('lazy environment handler fails closed and retries corrected configuration', async () => {
  const env = await environment();
  const privateKey = env.REVIEW_PORTAL_RECEIPT_PRIVATE_KEY;
  delete env.REVIEW_PORTAL_RECEIPT_PRIVATE_KEY;
  const handler = createEnvironmentPortalHandler(() => env);
  const response = await handler(new Request('https://reviewer.example.test/api/session'));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { code: 'service_unavailable' });
  env.REVIEW_PORTAL_RECEIPT_PRIVATE_KEY = privateKey;
  assert.equal(
    (await handler(new Request('https://reviewer.example.test/api/session'))).status,
    401
  );
});

test('lazy environment handler forwards the node adapter route path', async () => {
  const env = await environment();
  const handler = createEnvironmentPortalHandler(() => env);
  const response = await handler(
    new Request('http://127.0.0.1:4177/api'),
    '/api/session'
  );
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
