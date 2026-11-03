import assert from 'node:assert/strict';
import test from 'node:test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { dbAdmin } from '../src/db';
import {
  appendTenantMemberCredential,
  hasTenantMemberCredential,
} from '../src/tenant-member-credential';
import { issueTenantMemberNumber } from '../src/tenant-member-number';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';

const HASH = `$2b$10$${'a'.repeat(53)}`;
const dialect = new PgDialect();
const whereOf = (where: unknown) => dialect.sqlToQuery(where as never);

// Each select answers from the next queued row set; writes are recorded, never executed.
function mockAdmin(t: test.TestContext, answers: unknown[][]) {
  const selects: Array<{ where: unknown; locked: boolean }> = [];
  const inserts: unknown[] = [];
  const updates: Array<{ set: unknown; where: unknown }> = [];
  let transactions = 0;
  const select = () => {
    const call = { where: undefined as unknown, locked: false };
    selects.push(call);
    const rows = answers.shift() ?? [];
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      for: () => {
        call.locked = true;
        return chain;
      },
      limit: () => Promise.resolve(rows),
    };
    return chain;
  };
  const tx = {
    select,
    insert: () => ({
      values: (values: unknown) => {
        inserts.push(values);
        return Object.assign(Promise.resolve(), {
          onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ lastNumber: 7 }]) }),
        });
      },
    }),
    update: () => ({
      set: (set: unknown) => ({
        where: (where: unknown) => {
          updates.push({ set, where });
          return { returning: () => Promise.resolve([{ id: 'member-1' }]) };
        },
      }),
    }),
  };
  t.mock.method(dbAdmin, 'select', select as unknown as typeof dbAdmin.select);
  t.mock.method(dbAdmin, 'transaction', (async (work: (value: typeof tx) => unknown) => {
    transactions += 1;
    return work(tx);
  }) as unknown as typeof dbAdmin.transaction);
  return { selects, inserts, updates, transactions: () => transactions };
}

const agent = () => mintTestTenantAuthority('tenant_mk', { userId: 'agent-1', role: 'agent' });
const credential = { userId: 'member-1', email: 'member@example.com', passwordHash: HASH };

test('an agent attaches the first credential of a member it created in its own tenant', async t => {
  const admin = mockAdmin(t, [[{ id: 'member-1' }], []]);

  assert.equal(await appendTenantMemberCredential(agent(), credential), true);

  assert.equal(admin.selects[0].locked, true);
  const member = whereOf(admin.selects[0].where);
  assert.deepEqual(member.params, [
    'member-1',
    'tenant_mk',
    'member@example.com',
    'member',
    'agent',
    'agent-1',
  ]);
  assert.match(member.sql, /"tenant_id" = \$2/u);
  assert.match(member.sql, /"assisted_by_agent_id" = \$6/u);
  assert.equal(admin.inserts.length, 1);
  assert.deepEqual(
    { ...(admin.inserts[0] as Record<string, unknown>), createdAt: 0, updatedAt: 0 },
    {
      id: 'member-1-credential',
      accountId: 'member@example.com',
      providerId: 'credential',
      userId: 'member-1',
      password: HASH,
      createdAt: 0,
      updatedAt: 0,
    }
  );
});

test('a member outside the agent tenant, or not created by that agent, gets no credential', async t => {
  const admin = mockAdmin(t, [[]]);
  assert.equal(await appendTenantMemberCredential(agent(), credential), false);
  assert.equal(admin.inserts.length, 0);
});

test('a member that already has any account gets no second credential', async t => {
  const admin = mockAdmin(t, [[{ id: 'member-1' }], [{ id: 'existing' }]]);
  assert.equal(await appendTenantMemberCredential(agent(), credential), false);
  assert.equal(admin.inserts.length, 0);
});

test('a plaintext password, a non-agent or missing principal, or a blank member is refused before any query', async t => {
  const admin = mockAdmin(t, []);
  const cases: Array<[ReturnType<typeof agent>, typeof credential]> = [
    [agent(), { ...credential, passwordHash: 'Secret123!' }],
    [agent(), { ...credential, userId: '  ' }],
    [agent(), { ...credential, email: '' }],
    [mintTestTenantAuthority('tenant_mk'), credential],
    [mintTestTenantAuthority('tenant_mk', { userId: 'agent-1', role: 'staff' }), credential],
  ];
  for (const [authority, value] of cases) {
    assert.equal(await appendTenantMemberCredential(authority, value), false);
  }
  assert.equal(admin.transactions(), 0);
  assert.equal(admin.selects.length, 0);
});

test('credential existence is read only for a member of the authority tenant', async t => {
  const admin = mockAdmin(t, [[{ id: 'account-1' }], []]);

  assert.equal(await hasTenantMemberCredential(agent(), 'member-1'), true);
  assert.equal(await hasTenantMemberCredential(agent(), 'member-2'), false);
  assert.equal(await hasTenantMemberCredential(agent(), ' '), false);

  assert.equal(admin.selects.length, 2);
  const read = whereOf(admin.selects[0].where);
  assert.deepEqual(read.params, ['member-1', 'credential', 'tenant_mk']);
  assert.match(read.sql, /"user"\."tenant_id" = \$3/u);
  assert.match(read.sql, /"account"\."password" is not null/u);
});

test('a committed member of the authority tenant receives the next global member number', async t => {
  const admin = mockAdmin(t, [[{ id: 'member-1' }], [{ role: 'member', memberNumber: null }]]);
  const joinedAt = new Date('2026-11-02T10:00:00.000Z');

  assert.deepEqual(await issueTenantMemberNumber(agent(), { userId: 'member-1', joinedAt }), {
    memberNumber: 'MEM-2026-000007',
    isNew: true,
  });

  assert.equal(admin.transactions(), 1);
  assert.equal(admin.selects[0].locked, true);
  assert.deepEqual(whereOf(admin.selects[0].where).params, ['member-1', 'tenant_mk', 'member']);
  assert.deepEqual(admin.inserts, [{ year: 2026, lastNumber: 1 }]);
  assert.equal(admin.updates.length, 1);
  assert.equal((admin.updates[0].set as { memberNumber: string }).memberNumber, 'MEM-2026-000007');
});

test('no member number is issued for a user outside the authority tenant', async t => {
  const admin = mockAdmin(t, [[]]);
  assert.equal(
    await issueTenantMemberNumber(agent(), { userId: 'member-1', joinedAt: new Date() }),
    null
  );
  assert.equal(admin.inserts.length, 0);
  assert.equal(admin.updates.length, 0);
});

test('a blank member or an invalid join date advances nothing', async t => {
  const admin = mockAdmin(t, []);
  assert.equal(await issueTenantMemberNumber(agent(), { userId: '', joinedAt: new Date() }), null);
  assert.equal(
    await issueTenantMemberNumber(agent(), { userId: 'member-1', joinedAt: new Date('nope') }),
    null
  );
  assert.equal(admin.transactions(), 0);
});
