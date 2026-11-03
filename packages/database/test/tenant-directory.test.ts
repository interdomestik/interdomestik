import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  readTenantCurrency,
  readTenantLegalMetadata,
  readTenantLocaleMetadata,
} from '../src/tenant-directory';

test('directory capability restricts exact IDs and projections, with no missing-row fallback', async t => {
  const calls: Array<{ columns: unknown; where: unknown }> = [];
  const query = t.mock.method(
    dbAdmin.query.tenants,
    'findFirst',
    (options: { columns: unknown; where: unknown }) => {
      calls.push(options);
      return Promise.resolve(undefined);
    }
  );
  const id = "missing' OR true --";
  assert.equal(await readTenantLocaleMetadata(id), null);
  assert.equal(await readTenantLegalMetadata(id), null);
  assert.deepEqual(
    calls.map(call => call.columns),
    [
      { code: true, countryCode: true },
      { legalName: true, governingLaw: true },
    ]
  );
  const dialect = new PgDialect();
  for (const call of calls) {
    const compiled = dialect.sqlToQuery(call.where as Parameters<typeof dialect.sqlToQuery>[0]);
    assert.equal(compiled.sql, '"tenants"."id" = $1');
    assert.deepEqual(compiled.params, [id]);
  }
  assert.equal(await readTenantLocaleMetadata('  '), null);
  assert.equal(await readTenantLegalMetadata(''), null);
  assert.equal(query.mock.callCount(), 2);
});

test('currency reader is an exact-id, currency-only projection with no missing-row fallback', async t => {
  const calls: Array<{ columns: unknown; where: unknown }> = [];
  let row: { currency: string } | undefined;
  const query = t.mock.method(
    dbAdmin.query.tenants,
    'findFirst',
    (options: { columns: unknown; where: unknown }) => {
      calls.push(options);
      return Promise.resolve(row);
    }
  );

  assert.equal(await readTenantCurrency('tenant-x'), null);
  row = { currency: 'MKD' };
  assert.equal(await readTenantCurrency('tenant-mk'), 'MKD');

  assert.deepEqual(
    calls.map(call => call.columns),
    [{ currency: true }, { currency: true }]
  );
  const dialect = new PgDialect();
  const compiled = calls.map(call =>
    dialect.sqlToQuery(call.where as Parameters<typeof dialect.sqlToQuery>[0])
  );
  assert.deepEqual(
    compiled.map(c => c.sql),
    ['"tenants"."id" = $1', '"tenants"."id" = $1']
  );
  assert.deepEqual(
    compiled.map(c => c.params),
    [['tenant-x'], ['tenant-mk']]
  );

  assert.equal(await readTenantCurrency('  '), null);
  assert.equal(await readTenantCurrency(''), null);
  assert.equal(query.mock.callCount(), 2, 'blank ids must not query');
});
