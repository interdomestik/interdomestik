import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  admitVerifiedPaddleReceipt,
  appendPaddleInvalidSignatureEvidence,
  completePaddleReceiptLease,
} from '../src/paddle-webhook-receipts';
import { webhookEvents } from '../src/schema/webhooks';

type InsertCall = {
  table: unknown;
  values: Record<string, unknown> | undefined;
  conflictTarget: 'nothing' | undefined;
  returning: unknown;
};
type UpdateCall = {
  table: unknown;
  set: Record<string, unknown> | undefined;
  where: unknown;
  returning: unknown;
};
type SelectCall = { columns: unknown; from: unknown; where: unknown; limit: unknown };

function compile(fragment: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(fragment as Parameters<typeof dialect.sqlToQuery>[0]);
}

// Timestamp columns serialise bound dates to ISO strings.
function isTimestampParam(param: unknown): param is string | Date {
  return param instanceof Date || (typeof param === 'string' && /^\d{4}-\d{2}-\d{2}T/u.test(param));
}

function mockInsert(t: test.TestContext, returningRows: unknown[] = []) {
  const calls: InsertCall[] = [];
  const method = t.mock.method(dbAdmin, 'insert', ((table: unknown) => {
    const call: InsertCall = {
      table,
      values: undefined,
      conflictTarget: undefined,
      returning: undefined,
    };
    calls.push(call);
    // Awaiting the chain directly (no `.returning`) and awaiting `.returning(...)` both resolve.
    const conflict = {
      returning: (columns: unknown) => {
        call.returning = columns;
        return Promise.resolve(returningRows);
      },
      then: (resolve: (value: unknown) => unknown) => resolve(undefined),
    };
    const chain = {
      values: (values: Record<string, unknown>) => {
        call.values = values;
        return chain;
      },
      onConflictDoNothing: () => {
        call.conflictTarget = 'nothing';
        return conflict;
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.insert);
  return { calls, method };
}

function mockUpdate(t: test.TestContext, returningRows: unknown[]) {
  const calls: UpdateCall[] = [];
  const method = t.mock.method(dbAdmin, 'update', ((table: unknown) => {
    const call: UpdateCall = { table, set: undefined, where: undefined, returning: undefined };
    calls.push(call);
    const chain = {
      set: (set: Record<string, unknown>) => {
        call.set = set;
        return chain;
      },
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      returning: (columns: unknown) => {
        call.returning = columns;
        return Promise.resolve(returningRows);
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.update);
  return { calls, method };
}

function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: SelectCall[] = [];
  const method = t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call: SelectCall = { columns, from: undefined, where: undefined, limit: undefined };
    calls.push(call);
    const chain = {
      from: (table: unknown) => {
        call.from = table;
        return chain;
      },
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      limit: (limit: unknown) => {
        call.limit = limit;
        return Promise.resolve(rows);
      },
    };
    return chain;
  }) as unknown as typeof dbAdmin.select);
  return { calls, method };
}

const EVIDENCE = {
  processingScopeKey: 'entity:mk',
  dedupeKey: 'paddle:entity:mk:event:evt_1',
  eventType: 'subscription.created',
  eventId: 'evt_1',
  eventTimestamp: new Date('2026-09-25T08:00:00.000Z'),
  payloadHash: 'hash_1',
  payload: { data: { id: 'sub_1' } },
};

const VERIFIED = { ...EVIDENCE, providerTransactionId: 'txn_1', tenantId: 'tenant_mk' };

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
