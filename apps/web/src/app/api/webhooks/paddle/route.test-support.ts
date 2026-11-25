import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';

export const fixtureWebhookSecret = 'paddle-webhook-test-fixture';

export function createWebhookRequest(path: string, signed: boolean) {
  if (!signed) return new NextRequest(`http://localhost:3000${path}`, { method: 'POST' });

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    event_type: 'transaction.completed',
    event_id: 'evt_fixture',
    occurred_at: new Date(timestamp * 1000).toISOString(),
    data: { id: 'txn_fixture', status: 'completed' },
  });
  const digest = createHmac('sha256', fixtureWebhookSecret)
    .update(`${timestamp}:${body}`)
    .digest('hex');

  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'paddle-signature': `ts=${timestamp};h1=${digest}`,
    },
    body,
  });
}
