import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitVerifiedPaddleReceipt,
  appendPaddleInvalidSignatureEvidence,
} from '../src/paddle-webhook-receipts';
import { webhookEvents } from '../src/schema/webhooks';
import {
  compile,
  EVIDENCE,
  isTimestampParam,
  mockInsert,
  mockSelect,
  mockUpdate,
  VERIFIED,
} from './paddle-webhook-receipts.support';

test('invalid-signature evidence has no tenant, is never signature-valid and uses its own namespace', async t => {
  const insert = mockInsert(t);

  await appendPaddleInvalidSignatureEvidence(EVIDENCE);

  assert.equal(insert.calls.length, 1);
  const [call] = insert.calls;
  assert.equal(call.table, webhookEvents);
  assert.equal(call.conflictTarget, 'nothing', 'must be an idempotent append');
  const values = call.values!;
  assert.equal(values.tenantId, null);
  assert.equal(values.signatureValid, false);
  assert.equal(values.provider, 'paddle');
  assert.equal(values.processingScopeKey, 'invalid-signature:entity:mk');
  assert.equal(values.dedupeKey, 'invalid-signature:paddle:entity:mk:event:evt_1');
  assert.equal(values.payloadHash, 'hash_1');
  assert.equal(typeof values.id, 'string');
  // Evidence is never a lease: no processing state and no transaction linkage.
  assert.equal('receivedAt' in values, false);
  assert.equal('processingResult' in values, false);
  assert.equal('providerTransactionId' in values, false);
});

test('invalid-signature evidence cannot occupy the genuine receipt unique slots', async t => {
  const insert = mockInsert(t);

  await appendPaddleInvalidSignatureEvidence(EVIDENCE);

  const values = insert.calls[0].values!;
  assert.notEqual(values.dedupeKey, EVIDENCE.dedupeKey);
  assert.notEqual(values.processingScopeKey, EVIDENCE.processingScopeKey);
  assert.ok(String(values.dedupeKey).startsWith('invalid-signature:'));
  assert.ok(String(values.processingScopeKey).startsWith('invalid-signature:'));
});

test('admission inserts a fresh verified receipt and grants a lease at the inserted received_at', async t => {
  const insert = mockInsert(t, [{ id: 'we_new' }]);
  const update = mockUpdate(t, []);
  const select = mockSelect(t, []);

  const admission = await admitVerifiedPaddleReceipt(VERIFIED);

  assert.equal(admission.outcome, 'admitted');
  assert.ok(admission.outcome === 'admitted');
  assert.equal(admission.reclaimed, false);
  assert.equal(admission.lease.id, 'we_new');

  assert.equal(insert.calls.length, 1);
  const values = insert.calls[0].values!;
  assert.equal(values.signatureValid, true);
  assert.equal(values.tenantId, 'tenant_mk');
  assert.equal(values.provider, 'paddle');
  assert.equal(values.processingScopeKey, 'entity:mk');
  assert.equal(values.dedupeKey, 'paddle:entity:mk:event:evt_1');
  assert.equal(values.providerTransactionId, 'txn_1');
  assert.ok(values.receivedAt instanceof Date);
  assert.equal(
    admission.lease.leaseStartedAt.getTime(),
    (values.receivedAt as Date).getTime(),
    'the lease must be exactly the inserted received_at so only its holder can complete'
  );
  assert.equal(insert.calls[0].conflictTarget, 'nothing');
  assert.deepEqual(Object.keys(insert.calls[0].returning as object), ['id']);
  assert.equal(update.calls.length, 0, 'a fresh insert never attempts a reclaim');
  assert.equal(select.calls.length, 0);
});

test('admission keeps a null tenant for receipts whose tenant is unresolved', async t => {
  const insert = mockInsert(t, [{ id: 'we_global' }]);

  await admitVerifiedPaddleReceipt({ ...VERIFIED, tenantId: null, providerTransactionId: null });

  assert.equal(insert.calls[0].values?.tenantId, null);
  assert.equal(insert.calls[0].values?.providerTransactionId, null);
  assert.equal(insert.calls[0].values?.signatureValid, true);
});

test('admission reclaims by compare-and-set on the exact verified evidence', async t => {
  mockInsert(t, []);
  // The database assigns the new generation; it deliberately differs from the application clock.
  const returnedReceivedAt = new Date('2031-01-02T03:04:05.678Z');
  const update = mockUpdate(t, [{ id: 'we_existing', receivedAt: returnedReceivedAt }]);
  const select = mockSelect(t, []);

  const admission = await admitVerifiedPaddleReceipt(VERIFIED);

  assert.ok(admission.outcome === 'admitted');
  assert.equal(admission.reclaimed, true);
  assert.equal(admission.lease.id, 'we_existing');
  assert.equal(select.calls.length, 0);

  assert.equal(update.calls.length, 1);
  const [call] = update.calls;
  assert.equal(call.table, webhookEvents);
  // The reclaim starts a new lease and clears the previous terminal state.
  assert.deepEqual(Object.keys(call.set!).sort(), [
    'error',
    'processedAt',
    'processingResult',
    'receivedAt',
  ]);
  assert.equal(call.set!.processedAt, null);
  assert.equal(call.set!.processingResult, null);
  assert.equal(call.set!.error, null);
  assert.deepEqual(Object.keys(call.returning as object).sort(), ['id', 'receivedAt']);
  assert.equal(
    admission.lease.leaseStartedAt.getTime(),
    returnedReceivedAt.getTime(),
    'the lease is the received_at returned by the reclaim, not the application clock'
  );
  assert.ok(!(call.set!.receivedAt instanceof Date), 'received_at is assigned by SQL');
  const generation = compile(call.set!.receivedAt).sql;
  assert.ok(generation.includes('greatest('), generation);
  assert.ok(generation.includes("date_trunc('milliseconds'"), generation);
  assert.ok(generation.includes('"received_at"'), generation);
  assert.ok(generation.includes("interval '1 millisecond'"), generation);

  const where = compile(call.where);
  for (const column of [
    '"webhook_events"."provider" = $',
    '"webhook_events"."dedupe_key" = $',
    '"webhook_events"."processing_scope_key" = $',
    '"webhook_events"."payload_hash" = $',
    '"webhook_events"."signature_valid" = $',
    '"webhook_events"."processing_result" = $',
  ]) {
    assert.ok(where.sql.includes(column), `reclaim where must bind ${column}: ${where.sql}`);
  }
  for (const param of ['paddle', 'paddle:entity:mk:event:evt_1', 'entity:mk', 'hash_1', true]) {
    assert.ok(where.params.includes(param), `reclaim where must bind ${String(param)}`);
  }
  assert.ok(where.params.includes('retryable_error'));
  // Never selects by row id alone.
  assert.equal(where.sql.includes('"webhook_events"."id"'), false);
});

test('admission reclaims a stale recoverable lease only for recoverable event types', async t => {
  mockInsert(t, []);
  const recoverable = mockUpdate(t, [{ id: 'we_stale', receivedAt: new Date() }]);

  await admitVerifiedPaddleReceipt(VERIFIED);

  const recoverableWhere = compile(recoverable.calls[0].where);
  assert.ok(recoverableWhere.sql.includes('"webhook_events"."event_type" = $'));
  assert.ok(recoverableWhere.sql.includes('"webhook_events"."processing_result" is null'));
  assert.ok(recoverableWhere.sql.includes('"webhook_events"."received_at" < $'));
  assert.ok(recoverableWhere.params.includes('subscription.created'));
  const staleBefore = recoverableWhere.params.find(isTimestampParam);
  assert.ok(staleBefore !== undefined, 'stale cutoff must be a bound parameter');
  const age = Date.now() - new Date(staleBefore).getTime();
  assert.ok(
    age >= 5 * 60 * 1000 - 1000 && age < 5 * 60 * 1000 + 60_000,
    'stale after five minutes'
  );

  const plain = mockUpdate(t, [{ id: 'we_retry', receivedAt: new Date() }]);
  await admitVerifiedPaddleReceipt({ ...VERIFIED, eventType: 'transaction.completed' });
  const plainWhere = compile(plain.calls[0].where);
  assert.ok(plainWhere.params.includes('retryable_error'));
  assert.equal(plainWhere.sql.includes('"webhook_events"."received_at" < $'), false);
  assert.equal(plainWhere.sql.includes('is null'), false);
});
