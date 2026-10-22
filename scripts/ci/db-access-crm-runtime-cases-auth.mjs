import assert from 'node:assert/strict';
async function runCrmAuthCases() {
  const checks = [];
  const { dbAdmin, db, assertRlsConnectionRoleReady } = await import('./crm-runtime.cjs');
  const { sql, eq } = await import('drizzle-orm');
  const { user, memberCounters } = await import('./crm-runtime.cjs');
  const { generateMemberNumberWithRetry: generate } = await import('./crm-runtime.cjs');
  await assertRlsConnectionRoleReady();
  const tenants = await dbAdmin.query.tenants.findMany({ limit: 2 });
  assert.equal(tenants.length, 2);
  const { databaseAdapter, userSchemaConfig } = await import('./crm-runtime.cjs');
  const adapter = databaseAdapter({ user: userSchemaConfig });
  const now = /* @__PURE__ */ new Date('2031-01-02T12:00:00Z');
  const id = 'owned-auth-adapter-user';
  const fixtures = [
    [
      'user',
      {
        id,
        tenantId: tenants[0].id,
        name: 'Adapter fixture',
        email: 'owned-adapter@example.invalid',
        emailVerified: false,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
      { name: 'Updated fixture' },
    ],
    [
      'session',
      {
        id: 'owned-auth-session',
        userId: id,
        token: 'owned-fixed-fixture-token',
        expiresAt: /* @__PURE__ */ new Date('2031-02-01T00:00:00Z'),
        createdAt: now,
        updatedAt: now,
      },
      { expiresAt: /* @__PURE__ */ new Date('2031-03-01T00:00:00Z') },
    ],
    [
      'account',
      {
        id: 'owned-auth-account',
        userId: id,
        accountId: 'fixture-account',
        providerId: 'credential',
        createdAt: now,
        updatedAt: now,
      },
      { accountId: 'updated-account' },
    ],
    [
      'verification',
      {
        id: 'owned-auth-verification',
        identifier: 'fixture',
        value: 'fixture-only',
        expiresAt: /* @__PURE__ */ new Date('2031-02-01T00:00:00Z'),
        createdAt: now,
        updatedAt: now,
      },
      { value: 'updated-fixture' },
    ],
  ];
  for (const [model, data, update] of fixtures) {
    const where = [{ field: 'id', value: data.id }];
    const created2 = await adapter.create({ model, data, forceAllowId: true });
    assert.equal(created2.id, data.id);
    assert.equal((await adapter.findOne({ model, where }))?.id, data.id);
    await adapter.update({ model, where, update });
    const read = await adapter.findOne({ model, where });
    for (const [k, v] of Object.entries(update)) assert.deepEqual(read?.[k], v);
  }
  for (const [model, data] of [...fixtures].reverse()) {
    const where = [{ field: 'id', value: data.id }];
    await adapter.delete({ model, where });
    assert.equal(await adapter.findOne({ model, where }), null);
  }
  checks.push(
    'PASS A1: actual exported BetterAuth adapter CRUD for user/session/account/verification; no HTTP/lifecycle claim.'
  );
  async function add(id2, tenantId = tenants[0].id, role = 'member', year = 2032) {
    const date = /* @__PURE__ */ new Date(year + '-01-02T12:00:00Z');
    const row = {
      id: id2,
      tenantId,
      role,
      name: id2,
      email: id2 + '@example.invalid',
      emailVerified: false,
      createdAt: date,
      updatedAt: date,
    };
    await dbAdmin.insert(user).values(row);
    return row;
  }
  const get = async id2 => dbAdmin.query.user.findFirst({ where: eq(user.id, id2) });
  const counter = async year =>
    (await dbAdmin.query.memberCounters.findFirst({ where: eq(memberCounters.year, year) }))
      ?.lastNumber;
  const { databaseHooks } = await import('./crm-runtime.cjs');
  const created = await add('owned-user-hook');
  const untouched = await add('owned-user-other', tenants[1].id);
  await databaseHooks.user.create.after(created, null);
  const assigned = await get(created.id);
  assert.ok(assigned?.memberNumber);
  assert.ok(assigned.memberNumberIssuedAt);
  assert.equal((await get(untouched.id))?.memberNumber, null);
  const count = await counter(2032);
  await databaseHooks.user.create.after(created, null);
  assert.equal((await get(created.id))?.memberNumber, assigned.memberNumber);
  assert.equal(await counter(2032), count);
  const nonmember = await add('owned-nonmember', tenants[0].id, 'agent');
  await databaseHooks.user.create.after(nonmember, null);
  assert.equal((await get(nonmember.id))?.memberNumber, null);
  assert.equal(await counter(2032), count);
  const invalid = await add('owned-hook-missing-date');
  await databaseHooks.user.create.after({ id: invalid.id, role: 'member' }, null);
  assert.equal((await get(invalid.id))?.memberNumber, null);
  assert.equal(await counter(2032), count);
  checks.push(
    'PASS A2: actual registered user-create hook effects, idempotence, eligibility and missing-date denial.'
  );
  const healing = await add('owned-session-hook', tenants[1].id, 'member', 2033);
  await databaseHooks.session.create.after(
    { userId: healing.id, role: 'admin', createdAt: /* @__PURE__ */ new Date('2040-01-01') },
    null
  );
  const healed = await get(healing.id);
  assert.ok(healed?.memberNumber?.includes('2033'));
  const sessionCount = await counter(2033);
  for (const payload of [
    {},
    { userId: 'absent' },
    { userId: nonmember.id },
    { userId: healing.id },
  ])
    await databaseHooks.session.create.after(payload, null);
  assert.equal(await counter(2033), sessionCount);
  assert.equal((await get(healing.id))?.memberNumber, healed.memberNumber);
  checks.push(
    'PASS A3: actual registered session hook uses persisted member/year, rejects ineligible identities, preserves issued number.'
  );
  for (const userId of ['absent', nonmember.id])
    await assert.rejects(() => generate(dbAdmin, { userId, joinedAt: now }));
  assert.equal(await counter(2031), void 0);
  const repeated = await generate(dbAdmin, { userId: healing.id, joinedAt: now });
  assert.deepEqual(repeated, { memberNumber: healed.memberNumber, isNew: false });
  const rollback = await add('owned-member-rollback', tenants[0].id, 'member', 2034);
  await dbAdmin.insert(memberCounters).values({ year: 2034, lastNumber: 999999 });
  await assert.rejects(
    () => generate(dbAdmin, { userId: rollback.id, joinedAt: rollback.createdAt }),
    /Sequence out of range: 1000000/
  );
  assert.equal(await counter(2034), 999999);
  assert.equal((await get(rollback.id))?.memberNumber, null);
  assert.equal((await get(rollback.id))?.memberNumberIssuedAt, null);
  checks.push(
    'PASS M1/M2: real eligibility checks and counter-upsert failure rollback preserve DB state.'
  );
  const raceUser = await add('owned-race-member', tenants[0].id, 'member', 2036);
  await dbAdmin.insert(memberCounters).values({ year: 2036, lastNumber: 0 });
  const { default: postgres } = await import('postgres');
  const locker = postgres(process.env.DATABASE_URL, { max: 1 });
  let release, acquired;
  const releaseSignal = new Promise(resolve => {
    release = resolve;
  });
  const acquiredSignal = new Promise(resolve => {
    acquired = resolve;
  });
  const held = locker.begin(async connection => {
    await connection`SELECT year FROM member_counters WHERE year=2036 FOR UPDATE`;
    acquired();
    await releaseSignal;
  });
  await acquiredSignal;
  const calls = [
    generate(dbAdmin, { userId: raceUser.id, joinedAt: raceUser.createdAt }),
    generate(dbAdmin, { userId: raceUser.id, joinedAt: raceUser.createdAt }),
  ];
  let blocked = 0;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rows = await dbAdmin.execute(
        sql.raw(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%insert into%member_counters%'"
        )
      );
      blocked = Number(rows[0].n);
      if (blocked === 2) break;
      await new Promise(r => setTimeout(r, 25));
    }
    assert.equal(
      blocked,
      2,
      'both real transactions must pass eligibility and block on counter upsert'
    );
  } finally {
    release();
    await held;
    await locker.end();
  }
  const raced = await Promise.all(calls);
  assert.equal(new Set(raced.map(x => x.memberNumber)).size, 1);
  assert.deepEqual(raced.map(x => x.isNew).sort(), [false, true]);
  assert.equal(await counter(2036), 2);
  assert.equal((await get(raceUser.id))?.memberNumber, raced[0].memberNumber);
  checks.push(
    'PASS M3: both actual transactions blocked at counter upsert; losing conditional update reread immutable winner number.'
  );
  const uniqueA = await add('owned-unique-a', tenants[0].id, 'member', 2035),
    uniqueB = await add('owned-unique-b', tenants[1].id, 'member', 2035);
  const numbers = await Promise.all(
    [uniqueA, uniqueB].map(u => generate(dbAdmin, { userId: u.id, joinedAt: u.createdAt }))
  );
  assert.equal(new Set(numbers.map(x => x.memberNumber)).size, 2);
  assert.ok(numbers.every(x => x.isNew));
  for (const [i, u] of [uniqueA, uniqueB].entries())
    assert.deepEqual(await generate(dbAdmin, { userId: u.id, joinedAt: u.createdAt }), {
      memberNumber: numbers[i].memberNumber,
      isNew: false,
    });
  await assertRlsConnectionRoleReady();
  const context = await db.execute(
    sql.raw("SELECT current_setting('app.current_tenant_id',true) AS tenant")
  );
  assert.ok(!context[0].tenant);
  checks.push(
    'PASS M4: global uniqueness across tenants with concurrent actual generator calls and immutable repeats.'
  );
  return checks;
}
export { runCrmAuthCases };
