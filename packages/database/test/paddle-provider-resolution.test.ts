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

test('subscription owner resolver selects only id and tenant, matches id or provider id, limits to two', async t => {
  const { calls } = mockSelect(t, [{ subscriptionId: 'sub_internal_1', tenantId: 'tenant_ks' }]);

  const owner = await resolvePaddleSubscriptionOwner('  sub_provider_1  ');

  assert.deepEqual(owner, { subscriptionId: 'sub_internal_1', tenantId: 'tenant_ks' });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.deepEqual(Object.keys(call.columns as object).sort(), ['subscriptionId', 'tenantId']);
  assert.equal((call.columns as { subscriptionId: unknown }).subscriptionId, subscriptions.id);
  assert.equal((call.columns as { tenantId: unknown }).tenantId, subscriptions.tenantId);
  assert.equal(call.from, subscriptions);
  assert.equal(call.limit, 2, 'ambiguity must be detectable');

  const where = compile(call.where);
  assert.ok(where.sql.includes('"subscriptions"."id" = $'));
  assert.ok(where.sql.includes('"subscriptions"."provider_subscription_id" = $'));
  assert.ok(where.sql.includes(' or '));
  assert.deepEqual(where.params, ['sub_provider_1', 'sub_provider_1']);
});

test('subscription owner resolver reports none as null and two matches as ambiguous', async t => {
  const none = mockSelect(t, []);
  assert.equal(await resolvePaddleSubscriptionOwner('sub_unknown'), null);
  none.method.mock.restore();

  const two = mockSelect(t, [
    { subscriptionId: 'sub_a', tenantId: 'tenant_ks' },
    { subscriptionId: 'sub_b', tenantId: 'tenant_mk' },
  ]);
  assert.equal(await resolvePaddleSubscriptionOwner('sub_shared'), 'ambiguous');
  two.method.mock.restore();

  mockSelect(t, [{ subscriptionId: 'sub_a', tenantId: 'tenant_ks' }]);
  assert.deepEqual(await resolvePaddleSubscriptionOwner('sub_a'), {
    subscriptionId: 'sub_a',
    tenantId: 'tenant_ks',
  });
});

test('subscription owner resolver returns null for an empty or blank reference without querying', async t => {
  const { method } = mockSelect(t, [{ subscriptionId: 'sub_a', tenantId: 'tenant_ks' }]);

  assert.equal(await resolvePaddleSubscriptionOwner(''), null);
  assert.equal(await resolvePaddleSubscriptionOwner('   '), null);
  assert.equal(method.mock.callCount(), 0);
});

test('user owner resolver selects only id and tenant, matches the exact id and limits to two', async t => {
  const { calls } = mockSelect(t, [{ userId: 'user_1', tenantId: 'tenant_ks' }]);

  const owner = await resolvePaddleUserOwner(' user_1 ');

  assert.deepEqual(owner, { userId: 'user_1', tenantId: 'tenant_ks' });
  const [call] = calls;
  assert.deepEqual(Object.keys(call.columns as object).sort(), ['tenantId', 'userId']);
  assert.equal((call.columns as { userId: unknown }).userId, user.id);
  assert.equal((call.columns as { tenantId: unknown }).tenantId, user.tenantId);
  assert.equal(call.from, user);
  assert.equal(call.limit, 2);
  const where = compile(call.where);
  assert.equal(where.sql, '"user"."id" = $1');
  assert.deepEqual(where.params, ['user_1']);
});

test('user owner resolver fails closed on no match, ambiguity and blank input', async t => {
  const none = mockSelect(t, []);
  assert.equal(await resolvePaddleUserOwner('user_missing'), null);
  none.method.mock.restore();

  const two = mockSelect(t, [
    { userId: 'user_1', tenantId: 'tenant_ks' },
    { userId: 'user_1', tenantId: 'tenant_mk' },
  ]);
  assert.equal(await resolvePaddleUserOwner('user_1'), null);
  two.method.mock.restore();

  const blank = mockSelect(t, [{ userId: 'user_1', tenantId: 'tenant_ks' }]);
  assert.equal(await resolvePaddleUserOwner(''), null);
  assert.equal(await resolvePaddleUserOwner('  '), null);
  assert.equal(blank.method.mock.callCount(), 0);
});

test('customer email owner resolver selects only id and tenant, matches the exact email and limits to two', async t => {
  const { calls } = mockSelect(t, [{ userId: 'user_1', tenantId: 'tenant_ks' }]);

  const owner = await resolvePaddleCustomerEmailOwner('buyer@example.com');

  assert.deepEqual(owner, { userId: 'user_1', tenantId: 'tenant_ks' });
  const [call] = calls;
  assert.deepEqual(Object.keys(call.columns as object).sort(), ['tenantId', 'userId']);
  assert.equal(call.from, user);
  assert.equal(call.limit, 2);
  const where = compile(call.where);
  assert.equal(where.sql, '"user"."email" = $1');
  assert.deepEqual(where.params, ['buyer@example.com']);
});

test('customer email owner resolver reports none, ambiguous and blank distinctly', async t => {
  const none = mockSelect(t, []);
  assert.equal(await resolvePaddleCustomerEmailOwner('nobody@example.com'), null);
  none.method.mock.restore();

  const two = mockSelect(t, [
    { userId: 'user_1', tenantId: 'tenant_ks' },
    { userId: 'user_2', tenantId: 'tenant_mk' },
  ]);
  assert.equal(await resolvePaddleCustomerEmailOwner('shared@example.com'), 'ambiguous');
  two.method.mock.restore();

  const blank = mockSelect(t, [{ userId: 'user_1', tenantId: 'tenant_ks' }]);
  assert.equal(await resolvePaddleCustomerEmailOwner(''), null);
  assert.equal(blank.method.mock.callCount(), 0);
});
