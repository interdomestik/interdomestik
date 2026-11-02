import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  resolveClaimTrackingTokenTenant,
  resolveNpsSurveyTokenTenant,
} from '../src/public-token-tenant';

type Captured = { columns: unknown; where: unknown; limit: unknown };

function mockSelect(t: test.TestContext, rows: unknown[]) {
  const calls: Captured[] = [];
  const method = t.mock.method(dbAdmin, 'select', ((columns: unknown) => {
    const call: Captured = { columns, where: undefined, limit: undefined };
    calls.push(call);
    const chain = {
      from: () => chain,
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

function compile(where: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(where as Parameters<typeof dialect.sqlToQuery>[0]);
}

const NOW = new Date('2026-11-02T10:00:00.000Z');

const ACTIVE = { expiresAt: new Date('2026-12-01T00:00:00.000Z'), revokedAt: null };

test('claim tracking resolver queries by hash only, selects bounded columns and limits to two', async t => {
  const rawToken = 'raw-public-token-value';
  const { calls } = mockSelect(t, [{ tenantId: 'tenant-ks', claimId: 'claim-1', ...ACTIVE }]);

  const result = await resolveClaimTrackingTokenTenant(rawToken, NOW);

  assert.deepEqual(result, { tenantId: 'tenant-ks', claimId: 'claim-1' });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object).sort(), [
    'claimId',
    'expiresAt',
    'revokedAt',
    'tenantId',
  ]);
  assert.equal(calls[0].limit, 2);

  const compiled = compile(calls[0].where);
  const expectedHash = createHash('sha256').update(rawToken).digest('hex');
  assert.equal(compiled.sql, '"claim_tracking_tokens"."token_hash" = $1');
  assert.deepEqual(compiled.params, [expectedHash], 'where must bind only the sha256 hex');
  assert.ok(!compiled.params.includes(rawToken), 'raw token must never be a query parameter');
});

test('claim tracking resolver fails closed on zero or ambiguous matches', async t => {
  const none = mockSelect(t, []);
  assert.equal(await resolveClaimTrackingTokenTenant('token-a', NOW), null);
  assert.equal(none.calls[0].limit, 2);
  none.method.mock.restore();

  const twoActive = mockSelect(t, [
    { tenantId: 'tenant-ks', claimId: 'claim-1', ...ACTIVE },
    { tenantId: 'tenant-al', claimId: 'claim-2', ...ACTIVE },
  ]);
  assert.equal(await resolveClaimTrackingTokenTenant('token-a', NOW), null);
  twoActive.method.mock.restore();

  // An inactive same-hash row in another tenant still makes the hash ambiguous.
  mockSelect(t, [
    { tenantId: 'tenant-ks', claimId: 'claim-1', ...ACTIVE },
    { tenantId: 'tenant-al', claimId: 'claim-2', expiresAt: ACTIVE.expiresAt, revokedAt: NOW },
  ]);
  assert.equal(await resolveClaimTrackingTokenTenant('token-a', NOW), null);
});

test('claim tracking resolver rejects a unique but expired or revoked token', async t => {
  const expired = mockSelect(t, [
    { tenantId: 'tenant-ks', claimId: 'claim-1', expiresAt: NOW, revokedAt: null },
  ]);
  assert.equal(await resolveClaimTrackingTokenTenant('token-a', NOW), null);
  expired.method.mock.restore();

  mockSelect(t, [
    {
      tenantId: 'tenant-ks',
      claimId: 'claim-1',
      expiresAt: ACTIVE.expiresAt,
      revokedAt: new Date('2026-11-01T00:00:00.000Z'),
    },
  ]);
  assert.equal(await resolveClaimTrackingTokenTenant('token-a', NOW), null);
});

test('claim tracking resolver returns null for an empty token without querying', async t => {
  const { method } = mockSelect(t, [{ tenantId: 'tenant-ks', claimId: 'claim-1', ...ACTIVE }]);

  assert.equal(await resolveClaimTrackingTokenTenant('', NOW), null);
  assert.equal(method.mock.callCount(), 0);
});

test('NPS resolver selects only the tenant, matches the exact token and limits to two', async t => {
  const rawToken = 'nps-token-12345';
  const { calls } = mockSelect(t, [{ tenantId: 'tenant-mk' }]);

  const result = await resolveNpsSurveyTokenTenant(rawToken);

  assert.deepEqual(result, { tenantId: 'tenant-mk' });
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0].columns as object), ['tenantId']);
  assert.equal(calls[0].limit, 2);
  const compiled = compile(calls[0].where);
  assert.equal(compiled.sql, '"nps_survey_tokens"."token" = $1');
  assert.deepEqual(compiled.params, [rawToken]);
});

test('NPS resolver fails closed on zero or ambiguous matches', async t => {
  const none = mockSelect(t, []);
  assert.equal(await resolveNpsSurveyTokenTenant('nps-token-12345'), null);
  none.method.mock.restore();

  mockSelect(t, [{ tenantId: 'tenant-mk' }, { tenantId: 'tenant-ks' }]);
  assert.equal(await resolveNpsSurveyTokenTenant('nps-token-12345'), null);
});

test('NPS resolver returns null for an empty token without querying', async t => {
  const { method } = mockSelect(t, [{ tenantId: 'tenant-mk' }]);

  assert.equal(await resolveNpsSurveyTokenTenant(''), null);
  assert.equal(method.mock.callCount(), 0);
});
