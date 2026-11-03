import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  readVerifiedPaddleTransactionEvidence,
  resolvePaddleCustomerEmailOwner,
  resolvePaddleSubscriptionOwner,
  resolvePaddleUserOwner,
} from '../src/paddle-provider-resolution';
import { user } from '../src/schema/auth';
import { subscriptions } from '../src/schema/subscriptions';
import { webhookEvents } from '../src/schema/webhooks';

type Captured = {
  columns: unknown;
  from: unknown;
  where: unknown;
  orderBy: unknown[] | undefined;
  limit: unknown;
};

function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: Captured[] = [];
  const method = t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call: Captured = {
      columns,
      from: undefined,
      where: undefined,
      orderBy: undefined,
      limit: undefined,
    };
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
      orderBy: (...order: unknown[]) => {
        call.orderBy = order;
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

function compile(where: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(where as Parameters<typeof dialect.sqlToQuery>[0]);
}

test('entity-route transaction evidence binds transaction, provider, signature, event type and scope', async t => {
  const stored = { payload: { data: { id: 'txn_1' } }, processingResult: 'ok' };
  const { calls } = mockSelect(t, [
    { ...stored, processingScopeKey: 'entity:mk', payloadHash: 'hash_1' },
  ]);

  const evidence = await readVerifiedPaddleTransactionEvidence({
    transactionId: 'txn_1',
    processingScopeKey: 'entity:mk',
    entityRoute: true,
  });

  assert.deepEqual(evidence, stored, 'only payload and processingResult are returned');
  assert.deepEqual(Object.keys(evidence as object).sort(), ['payload', 'processingResult']);
  const [call] = calls;
  assert.deepEqual(Object.keys(call.columns as object).sort(), [
    'payload',
    'payloadHash',
    'processingResult',
    'processingScopeKey',
  ]);
  assert.equal(call.orderBy, undefined);
  assert.equal(call.from, webhookEvents);
  assert.equal(call.limit, 2);

  const where = compile(call.where);
  for (const column of [
    '"webhook_events"."provider_transaction_id" = $',
    '"webhook_events"."provider" = $',
    '"webhook_events"."signature_valid" = $',
    '"webhook_events"."event_type" = $',
    '"webhook_events"."processing_scope_key" = $',
  ]) {
    assert.ok(where.sql.includes(column), `entity route must bind ${column}: ${where.sql}`);
  }
  assert.deepEqual(where.params, ['txn_1', 'paddle', true, 'transaction.completed', 'entity:mk']);
});

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    payload: { data: { id: 'txn_1' } },
    processingResult: null,
    processingScopeKey: 'global',
    payloadHash: 'hash_1',
    ...overrides,
  };
}

const LEGACY_ARGS = {
  transactionId: 'txn_1',
  processingScopeKey: 'global',
  entityRoute: false,
} as const;

test('legacy-route transaction evidence is narrowed to verified Paddle receipts, ordered, bounded to 11', async t => {
  const { calls } = mockSelect(t, [legacyRow()]);

  const evidence = await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS);

  assert.deepEqual(evidence, { payload: { data: { id: 'txn_1' } }, processingResult: null });
  assert.deepEqual(Object.keys(evidence as object).sort(), ['payload', 'processingResult']);
  const [call] = calls;
  assert.equal(call.from, webhookEvents);
  assert.deepEqual(Object.keys(call.columns as object).sort(), [
    'payload',
    'payloadHash',
    'processingResult',
    'processingScopeKey',
  ]);
  const where = compile(call.where);
  assert.ok(where.sql.includes('"webhook_events"."provider_transaction_id" = $'));
  assert.ok(where.sql.includes('"webhook_events"."provider" = $'));
  assert.ok(where.sql.includes('"webhook_events"."signature_valid" = $'));
  assert.equal(where.sql.includes('processing_scope_key'), false, 'legacy route has no scope');
  assert.equal(where.sql.includes('event_type'), false);
  assert.deepEqual(where.params, ['txn_1', 'paddle', true]);
  assert.equal(call.limit, 11);
  const order = (call.orderBy ?? []).map(o => compile(o).sql);
  assert.deepEqual(order, ['"webhook_events"."received_at" asc', '"webhook_events"."id" asc']);
});

test('legacy-route evidence returns null for zero candidates and above the candidate bound', async t => {
  const none = mockSelect(t, []);
  assert.equal(await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS), null);
  none.method.mock.restore();

  const ten = mockSelect(
    t,
    Array.from({ length: 10 }, (_, index) => legacyRow({ processingScopeKey: `s${index}` }))
  );
  assert.ok(
    await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS),
    'exactly ten identical-payload candidates are still within the bound'
  );
  ten.method.mock.restore();

  // Even with the caller's own scope present, an over-bound candidate set fails closed.
  mockSelect(
    t,
    Array.from({ length: 11 }, (_, index) =>
      legacyRow({ processingScopeKey: index === 0 ? 'global' : `s${index}` })
    )
  );
  assert.equal(await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS), null);
});

test('legacy-route evidence prefers the single own-scope receipt even when other scopes differ', async t => {
  mockSelect(t, [
    legacyRow({ processingScopeKey: 'entity:ks', payloadHash: 'hash_other', payload: { a: 1 } }),
    legacyRow({
      processingScopeKey: 'global',
      payloadHash: 'hash_own',
      payload: { own: true },
      processingResult: 'ok',
    }),
    legacyRow({ processingScopeKey: 'entity:mk', payloadHash: 'hash_third', payload: { b: 2 } }),
  ]);

  assert.deepEqual(await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS), {
    payload: { own: true },
    processingResult: 'ok',
  });
});

test('legacy-route evidence is null when two receipts share the caller own scope', async t => {
  mockSelect(t, [
    legacyRow({ processingScopeKey: 'global' }),
    legacyRow({ processingScopeKey: 'global' }),
  ]);

  assert.equal(await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS), null);
});

test('legacy-route evidence without an own-scope receipt needs identical payload hashes and returns the first', async t => {
  const same = mockSelect(t, [
    legacyRow({ processingScopeKey: 'entity:ks', payload: { first: true }, processingResult: 'a' }),
    legacyRow({ processingScopeKey: 'entity:mk', payload: { second: true } }),
  ]);
  assert.deepEqual(await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS), {
    payload: { first: true },
    processingResult: 'a',
  });
  same.method.mock.restore();

  mockSelect(t, [
    legacyRow({ processingScopeKey: 'entity:ks', payloadHash: 'hash_1' }),
    legacyRow({ processingScopeKey: 'entity:mk', payloadHash: 'hash_2' }),
  ]);
  assert.equal(await readVerifiedPaddleTransactionEvidence(LEGACY_ARGS), null);
});

test('entity-route transaction evidence returns null when absent or not exactly one row', async t => {
  const none = mockSelect(t, []);
  assert.equal(
    await readVerifiedPaddleTransactionEvidence({
      transactionId: 'txn_missing',
      processingScopeKey: 'entity:mk',
      entityRoute: true,
    }),
    null
  );
  none.method.mock.restore();

  mockSelect(t, [
    legacyRow({ processingScopeKey: 'entity:mk' }),
    legacyRow({ processingScopeKey: 'entity:mk' }),
  ]);
  assert.equal(
    await readVerifiedPaddleTransactionEvidence({
      transactionId: 'txn_1',
      processingScopeKey: 'entity:mk',
      entityRoute: true,
    }),
    null
  );
});
