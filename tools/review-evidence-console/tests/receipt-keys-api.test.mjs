import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionToken } from '../server/auth/session-token.mjs';
import { createPortalHandler } from '../server/portal-handler.mjs';
import { createReceiptService } from '../server/receipts/receipt-service.mjs';
import { createTestReceiptKeyring } from './receipt-key-fixtures.mjs';

const origin = 'https://reviewer.example.test';
const secret = Buffer.alloc(32, 9).toString('base64url');
const account = Object.freeze({
  id: 'acct_gazmend',
  username: 'gazmend',
  displayName: 'Gazmend Abazi',
  role: 'governance',
  fixtureId: 'reviewer_governance_mk',
  disabled: false,
  sessionVersion: 1,
});

test('authenticated key endpoint exposes public verification material only', async () => {
  const receiptService = createReceiptService({ keyring: await createTestReceiptKeyring() });
  const handler = createPortalHandler({
    registry: { byId: new Map([[account.id, account]]) },
    sessionSecret: secret,
    fixtureService: {},
    receiptService,
    now: () => 1_800_000_000,
  });
  const token = await createSessionToken(account, {
    secret,
    origin,
    now: () => 1_800_000_000,
  });
  const response = await handler(
    new Request(origin + '/api/receipts/keys', {
      headers: { cookie: `review_portal_session=${token}` },
    })
  );
  assert.equal(response.status, 200);
  const bundle = await response.json();
  assert.equal(bundle.algorithm, 'Ed25519');
  assert.equal(bundle.keys.length, 1);
  assert.deepEqual(Object.keys(bundle.keys[0]).sort(), ['fingerprint', 'id', 'publicKeySpki']);
  assert.equal(JSON.stringify(bundle).includes('private'), false);
  const upload = await handler(
    new Request(origin + '/api/receipts/verify', {
      method: 'POST',
      headers: {
        origin,
        cookie: `review_portal_session=${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ receipt: { private: 'evidence' } }),
    })
  );
  assert.equal(upload.status, 404);
});
