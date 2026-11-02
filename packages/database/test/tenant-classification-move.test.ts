import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableName } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  agentClients,
  claims,
  emailCampaignLogs,
  memberLeads,
  memberNotes,
  memberReferralRewards,
  membershipCards,
  membershipFamilyMembers,
  notifications,
  pushSubscriptions,
  referrals,
  subscriptions,
  tenants,
  user,
  userNotificationPreferences,
  userRoles,
} from '../src/schema';
import { moveUserTenantClassification } from '../src/tenant-classification-move';

const FROM = 'tenant-from';
const TO = 'tenant-to';
const USER = 'user-1';

const PROBE_TABLES = [
  claims,
  subscriptions,
  userNotificationPreferences,
  memberNotes,
  agentClients,
  pushSubscriptions,
  membershipCards,
  userRoles,
  memberLeads,
  emailCampaignLogs,
  membershipFamilyMembers,
  notifications,
  referrals,
  memberReferralRewards,
].map(table => getTableName(table));

type Step =
  | { kind: 'select'; table: string; where: unknown; lock: string | null; limit: number | null }
  | { kind: 'update'; table: string; set: unknown; where: unknown };

type Script = {
  userRows: unknown[];
  targetRows: unknown[];
  /** Table names whose tenant-bound probe returns a row. */
  boundTables: string[];
  updateRows: unknown[];
};

function compile(where: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(where as Parameters<typeof dialect.sqlToQuery>[0]);
}

function installTransaction(t: test.TestContext, script: Partial<Script> = {}) {
  const full: Script = {
    userRows: [{ id: USER, pending: true }],
    targetRows: [{ id: TO }],
    boundTables: [],
    updateRows: [{ id: USER }],
    ...script,
  };
  const started: Step[] = [];
  const executed: Step[] = [];

  const fakeTx = {
    select: () => {
      let table = '';
      let where: unknown;
      const step = (lock: string | null, limit: number | null): Step => ({
        kind: 'select',
        table,
        where,
        lock,
        limit,
      });
      const rowsFor = () => {
        if (table === getTableName(user)) return full.userRows;
        if (table === getTableName(tenants)) return full.targetRows;
        return full.boundTables.includes(table) ? [{ id: 'bound-row' }] : [];
      };
      // Lazy like a drizzle builder: it only runs, and is only recorded, when awaited.
      const lazy = (lock: string | null, limit: number | null) => ({
        then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) => {
          const recorded = step(lock, limit);
          executed.push(recorded);
          return Promise.resolve(rowsFor()).then(resolve, reject);
        },
      });
      const chain = {
        from: (source: Parameters<typeof getTableName>[0]) => {
          table = getTableName(source);
          return chain;
        },
        where: (clause: unknown) => {
          where = clause;
          started.push(step(null, null));
          return chain;
        },
        for: (lock: string) => lazy(lock, null),
        limit: (limit: number) => lazy(null, limit),
      };
      return chain;
    },
    update: (source: Parameters<typeof getTableName>[0]) => {
      const table = getTableName(source);
      let set: unknown;
      const chain = {
        set: (values: unknown) => {
          set = values;
          return chain;
        },
        where: (clause: unknown) => ({
          returning: () => {
            executed.push({ kind: 'update', table, set, where: clause });
            return Promise.resolve(full.updateRows);
          },
        }),
      };
      return chain;
    },
  };

  const transaction = t.mock.method(dbAdmin, 'transaction', ((
    callback: (tx: typeof fakeTx) => Promise<unknown>
  ) => callback(fakeTx)) as unknown as typeof dbAdmin.transaction);
  return { transaction, executed };
}

const MOVE = { userId: USER, fromTenantId: FROM, toTenantId: TO };

test('a clean move runs one transaction and returns the previous pending flag', async t => {
  const { transaction, executed } = installTransaction(t);

  const result = await moveUserTenantClassification(MOVE);

  assert.deepEqual(result, { outcome: 'moved', previousPending: true });
  assert.equal(transaction.mock.callCount(), 1);
  // user select, tenant select, 14 probes, update
  assert.equal(executed.length, 2 + PROBE_TABLES.length + 1);
  assert.equal(executed.at(-1)?.kind, 'update');
});

test('previousPending is false when the user was not pending', async t => {
  installTransaction(t, { userRows: [{ id: USER, pending: false }] });
  assert.deepEqual(await moveUserTenantClassification(MOVE), {
    outcome: 'moved',
    previousPending: false,
  });
});

test('the user is locked FOR UPDATE with id and from-tenant predicates', async t => {
  const { executed } = installTransaction(t);
  await moveUserTenantClassification(MOVE);

  const first = executed[0];
  assert.ok(first.kind === 'select');
  assert.equal(first.table, getTableName(user));
  assert.equal(first.lock, 'update');
  const compiled = compile(first.where);
  assert.match(compiled.sql, /"user"\."id" = \$1/);
  assert.match(compiled.sql, /"user"\."tenant_id" = \$2/);
  assert.deepEqual(compiled.params, [USER, FROM]);
});

test('the target tenant is read FOR SHARE as active, by exact id', async t => {
  const { executed } = installTransaction(t);
  await moveUserTenantClassification(MOVE);

  const second = executed[1];
  assert.ok(second.kind === 'select');
  assert.equal(second.table, getTableName(tenants));
  assert.equal(second.lock, 'share');
  const compiled = compile(second.where);
  assert.match(compiled.sql, /"tenants"\."id" = \$1/);
  assert.match(compiled.sql, /"tenants"\."is_active" = \$2/);
  assert.deepEqual(compiled.params, [TO, true]);
});

test('all 14 tenant-bound probes are limited to one row and carry the from-tenant predicate', async t => {
  const { executed } = installTransaction(t);
  await moveUserTenantClassification(MOVE);

  const probes = executed.slice(2, 2 + PROBE_TABLES.length);
  assert.deepEqual(
    probes.map(probe => (probe.kind === 'select' ? probe.table : null)),
    PROBE_TABLES
  );
  for (const probe of probes) {
    assert.ok(probe.kind === 'select');
    assert.equal(probe.limit, 1, `${probe.table} probe must be limited to one row`);
    const compiled = compile(probe.where);
    assert.match(
      compiled.sql,
      new RegExp(`"${probe.table}"\\."tenant_id" = \\$\\d`),
      `${probe.table} probe must filter tenant_id`
    );
    assert.ok(compiled.params.includes(FROM), `${probe.table} probe must bind the from tenant`);
    assert.ok(compiled.params.includes(USER), `${probe.table} probe must bind the user`);
    assert.ok(!compiled.params.includes(TO), `${probe.table} probe must not bind the target`);
    assert.equal(compiled.params.length, 2);
  }
});

test('the update sets the target tenant and clears pending, guarded by id and from-tenant', async t => {
  const { executed } = installTransaction(t);
  await moveUserTenantClassification(MOVE);

  const update = executed.at(-1);
  assert.ok(update?.kind === 'update');
  assert.equal(update.table, getTableName(user));
  assert.deepEqual(update.set, { tenantId: TO, tenantClassificationPending: false });
  const compiled = compile(update.where);
  assert.match(compiled.sql, /"user"\."id" = \$1/);
  assert.match(compiled.sql, /"user"\."tenant_id" = \$2/);
  assert.deepEqual(compiled.params, [USER, FROM]);
});

test('a user outside the from tenant returns user_not_found without further reads or writes', async t => {
  const { executed } = installTransaction(t, { userRows: [] });

  assert.deepEqual(await moveUserTenantClassification(MOVE), { outcome: 'user_not_found' });
  assert.equal(executed.length, 1);
});

test('an unknown or inactive target returns target_tenant_not_found before any probe', async t => {
  const { executed } = installTransaction(t, { targetRows: [] });

  assert.deepEqual(await moveUserTenantClassification(MOVE), {
    outcome: 'target_tenant_not_found',
  });
  assert.equal(executed.length, 2);
  assert.ok(executed.every(step => step.kind === 'select'));
});

for (const [index, table] of PROBE_TABLES.entries()) {
  test(`a tenant-bound row in ${table} returns tenant_bound_records_exist and never updates`, async t => {
    const { executed } = installTransaction(t, { boundTables: [table] });

    assert.deepEqual(await moveUserTenantClassification(MOVE), {
      outcome: 'tenant_bound_records_exist',
    });
    assert.ok(
      executed.every(step => step.kind === 'select'),
      'no update after a bound record'
    );
    // user + tenant + probes up to and including the hit
    assert.equal(executed.length, 2 + index + 1);
  });
}

test('a zero-row update throws instead of reporting a move', async t => {
  installTransaction(t, { updateRows: [] });
  await assert.rejects(moveUserTenantClassification(MOVE), /affected an unexpected number of rows/);
});

test('a multi-row update throws instead of reporting a move', async t => {
  installTransaction(t, { updateRows: [{ id: USER }, { id: 'other' }] });
  await assert.rejects(moveUserTenantClassification(MOVE), /affected an unexpected number of rows/);
});

test('blank ids and a same-tenant move return user_not_found without a transaction', async t => {
  const { transaction } = installTransaction(t);
  const cases = [
    { userId: '', fromTenantId: FROM, toTenantId: TO },
    { userId: USER, fromTenantId: '', toTenantId: TO },
    { userId: USER, fromTenantId: FROM, toTenantId: '' },
    { userId: USER, fromTenantId: FROM, toTenantId: FROM },
  ];
  for (const params of cases) {
    assert.deepEqual(await moveUserTenantClassification(params), { outcome: 'user_not_found' });
  }
  assert.equal(transaction.mock.callCount(), 0);
});
