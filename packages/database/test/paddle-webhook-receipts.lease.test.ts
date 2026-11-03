import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitVerifiedPaddleReceipt,
  completePaddleReceiptLease,
} from '../src/paddle-webhook-receipts';
import { webhookEvents } from '../src/schema/webhooks';
import {
  compile,
  isTimestampParam,
  mockInsert,
  mockSelect,
  mockUpdate,
  VERIFIED,
} from './paddle-webhook-receipts.support';

test('admission reports an active recoverable lease as in progress', async t => {
  mockInsert(t, []);
  mockUpdate(t, []);
  const select = mockSelect(t, [{ id: 'we_active' }]);

  const admission = await admitVerifiedPaddleReceipt(VERIFIED);

  assert.deepEqual(admission, { outcome: 'in_progress', receiptId: 'we_active' });
  assert.equal(select.calls.length, 1);
  const [call] = select.calls;
  assert.equal(call.from, webhookEvents);
  assert.deepEqual(Object.keys(call.columns as object), ['id']);
  assert.equal(call.limit, 1);
  const where = compile(call.where);
  assert.ok(where.sql.includes('"webhook_events"."signature_valid" = $'));
  assert.ok(where.sql.includes('"webhook_events"."event_type" = $'));
  assert.ok(where.sql.includes('"webhook_events"."processing_result" is null'));
  for (const param of ['paddle', 'paddle:entity:mk:event:evt_1', 'entity:mk', 'hash_1', true]) {
    assert.ok(where.params.includes(param), `active-lease where must bind ${String(param)}`);
  }
});

test('admission treats an entity past_due receipt as recoverable but a tenant-scope one as terminal', async t => {
  mockInsert(t, []);
  mockUpdate(t, []);
  const entity = mockSelect(t, [{ id: 'we_past_due' }]);

  assert.deepEqual(
    await admitVerifiedPaddleReceipt({ ...VERIFIED, eventType: 'subscription.past_due' }),
    { outcome: 'in_progress', receiptId: 'we_past_due' }
  );
  assert.equal(entity.calls.length, 1);
  entity.method.mock.restore();

  const tenant = mockSelect(t, [{ id: 'never_read' }]);
  assert.deepEqual(
    await admitVerifiedPaddleReceipt({
      ...VERIFIED,
      eventType: 'subscription.past_due',
      processingScopeKey: 'tenant:tenant_mk',
    }),
    { outcome: 'duplicate' }
  );
  assert.equal(tenant.calls.length, 0);
});

test('admission returns duplicate when a recoverable receipt is already terminal', async t => {
  mockInsert(t, []);
  mockUpdate(t, []);
  const select = mockSelect(t, []);

  assert.deepEqual(await admitVerifiedPaddleReceipt(VERIFIED), { outcome: 'duplicate' });
  assert.equal(select.calls.length, 1);
});

test('admission returns duplicate for a non-recoverable event type without any active-lease read', async t => {
  mockInsert(t, []);
  const update = mockUpdate(t, []);
  const select = mockSelect(t, [{ id: 'never_read' }]);

  const admission = await admitVerifiedPaddleReceipt({
    ...VERIFIED,
    eventType: 'transaction.completed',
  });

  assert.deepEqual(admission, { outcome: 'duplicate' });
  assert.equal(update.calls.length, 1, 'the reclaim is still attempted once');
  assert.equal(select.calls.length, 0);
});

test('lease completion binds the row id, the lease start, an open state and a verified receipt', async t => {
  const update = mockUpdate(t, [{ id: 'we_1' }]);
  const leaseStartedAt = new Date('2026-09-25T08:00:00.123Z');

  const completed = await completePaddleReceiptLease(
    { id: 'we_1', leaseStartedAt },
    { result: 'ok' }
  );

  assert.equal(completed, true);
  assert.equal(update.calls.length, 1);
  const [call] = update.calls;
  assert.equal(call.table, webhookEvents);
  assert.equal(call.set!.processingResult, 'ok');
  assert.equal(call.set!.error, null);
  assert.ok(call.set!.processedAt instanceof Date);

  const where = compile(call.where);
  assert.ok(where.sql.includes('"webhook_events"."id" = $'));
  assert.ok(where.sql.includes('"webhook_events"."received_at" = $'));
  assert.ok(where.sql.includes('"webhook_events"."processing_result" is null'));
  assert.ok(where.sql.includes('"webhook_events"."signature_valid" = $'));
  assert.ok(where.params.includes('we_1'));
  assert.ok(where.params.includes(true));
  const bound = where.params.find(isTimestampParam);
  assert.ok(bound !== undefined, 'lease start must be a bound parameter');
  assert.equal(new Date(bound).getTime(), leaseStartedAt.getTime());
});

test('lease completion records a truncated error for failed results', async t => {
  const update = mockUpdate(t, [{ id: 'we_1' }]);
  const lease = { id: 'we_1', leaseStartedAt: new Date('2026-09-25T08:00:00.000Z') };

  await completePaddleReceiptLease(lease, { result: 'retryable_error', error: 'x'.repeat(5000) });
  assert.equal(update.calls[0].set!.processingResult, 'retryable_error');
  assert.equal((update.calls[0].set!.error as string).length, 2000);

  await completePaddleReceiptLease(lease, { result: 'error', error: 'tenant conflict' });
  assert.equal(update.calls[1].set!.processingResult, 'error');
  assert.equal(update.calls[1].set!.error, 'tenant conflict');
});

test('lease completion returns false when no row matches a stale or already completed lease', async t => {
  mockUpdate(t, []);

  const completed = await completePaddleReceiptLease(
    { id: 'we_1', leaseStartedAt: new Date('2026-09-25T08:00:00.000Z') },
    { result: 'error', error: 'boom' }
  );

  assert.equal(completed, false);
});
