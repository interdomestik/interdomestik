import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionToken } from '../server/auth/session-token.mjs';
import { routeReceipts } from '../server/routes/receipt-routes.mjs';

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

test('receipt route rejects malformed assignment IDs before fixture lookup', async () => {
  let loads = 0;
  const token = await createSessionToken(account, { secret, origin, now: () => 1_800_000_000 });
  const request = new Request(origin + '/api/receipts', {
    method: 'POST',
    headers: {
      origin,
      cookie: `review_portal_session=${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ assignmentId: '../../other' }),
  });
  const response = await routeReceipts(request, '/api/receipts', {
    registry: { byId: new Map([[account.id, account]]) },
    sessionSecret: secret,
    now: () => 1_800_000_000,
    events: { emit() {} },
    receiptService: {},
    fixtureService: {
      async loadAssignment() {
        loads += 1;
        return { ok: false };
      },
    },
  });
  assert.equal(response.status, 404);
  assert.equal(loads, 0);
});
