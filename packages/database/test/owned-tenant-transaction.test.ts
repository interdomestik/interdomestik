import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { runTenantTransaction } from '../src/tenant-transaction';

function transactionFixture(failRoleCheck?: number) {
  const events: string[] = [];
  let checks = 0;
  const tx = {
    async execute(query: Parameters<PgDialect['sqlToQuery']>[0]) {
      const text = new PgDialect().sqlToQuery(query).sql;
      events.push(text);
      if (text.includes('pg_catalog.pg_roles') && ++checks === failRoleCheck)
        throw new Error('database refused privileged role');
      return [];
    },
  };
  const database = {
    async transaction(action: (value: typeof tx) => Promise<unknown>) {
      events.push('begin');
      try {
        const result = await action(tx);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  };
  return { events, database };
}

test('owned transaction checks connection and configured role before invoking data access', async () => {
  const { database, events } = transactionFixture();
  const value = await runTenantTransaction(
    database,
    async () => {
      events.push('ready');
    },
    { tenantId: 'tenant-a', role: 'admin', dbRole: 'restricted_a' },
    async () => {
      events.push('read');
      return 'dto';
    },
    true
  );
  assert.equal(value, 'dto');
  assert.equal(events.filter(event => event.includes('pg_catalog.pg_roles')).length, 2);
  const role = events.findIndex(event => event.includes('set local role'));
  assert(events.slice(0, role).some(event => event.includes('pg_catalog.pg_roles')));
  assert(
    events
      .slice(role + 1, events.indexOf('read'))
      .some(event => event.includes('pg_catalog.pg_roles'))
  );
  assert(
    events.indexOf('read') > events.findIndex(event => event.includes('app.current_tenant_id'))
  );
  assert.equal(events.at(-1), 'commit');
});

for (const failure of [1, 2]) {
  test(`server refusal at posture check ${failure} rolls back without invoking data access`, async () => {
    const { database, events } = transactionFixture(failure);
    await assert.rejects(
      runTenantTransaction(
        database,
        async () => {},
        { tenantId: 'tenant-a', role: 'admin', dbRole: 'restricted_a' },
        async () => {
          events.push('read');
        },
        true
      ),
      /database refused privileged role/
    );
    assert(!events.includes('read'));
    assert.equal(events.at(-1), 'rollback');
  });
}

test('invalid tenant is rejected before readiness or connection acquisition', async () => {
  const { database, events } = transactionFixture();
  await assert.rejects(
    runTenantTransaction(
      database,
      async () => {
        events.push('ready');
      },
      { tenantId: '   ' },
      async () => {
        events.push('read');
      },
      true
    ),
    /non-empty tenantId/
  );
  assert.deepEqual(events, []);
});

test('legacy helper retains transaction-local context without silently adding owned checks', async () => {
  const { database, events } = transactionFixture();
  await runTenantTransaction(
    database,
    async () => {},
    { tenantId: 'tenant-a' },
    async () => 'dto'
  );
  assert(!events.some(event => event.includes('pg_catalog.pg_roles')));
  assert(events.some(event => event.includes('set local row_security = on')));
  assert(events.some(event => event.includes('app.current_access_tenant_id')));
  assert.equal(events.at(-1), 'commit');
});
