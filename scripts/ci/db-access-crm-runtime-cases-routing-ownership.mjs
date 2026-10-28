import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';

// Development/native producer fixture only: this is NOT a production CrmOutboxPort adapter.
export async function runCrmRoutingOwnershipCases() {
  const app = await import('./crm-runtime.cjs');
  const { dbAdmin, db, createApplyCrmLeadRoutingDecisionCoordinator: create } = app;
  await app.assertRlsConnectionRoleReady();
  const token = randomBytes(8).toString('hex');
  const prefix = `owned-routing-${token}`;
  const table = `owned_routing_outbox_${token}`;
  const sequence = `owned_routing_attempt_${token}`;
  const role = process.env.DB_RLS_ROLE;
  assert.match(role, /^s8_crm_app_[a-f0-9]+$/u);
  const raw = text => sql.raw(text);
  const admin = (
    await dbAdmin.execute(sql`select id from "user"
    where tenant_id='tenant_ks' and role='admin' order by id limit 1`)
  )[0];
  assert.ok(admin);
  const branch = `${prefix}-branch`;
  const agents = [0, 1, 2].map(n => `${prefix}-agent-${n}`);
  const leads = ['success', 'rollback', 'concurrent-a', 'concurrent-b', 'foreign'];
  const actor = {
    actorId: admin.id,
    tenantId: 'tenant_ks',
    role: 'admin',
    scope: { branchId: null },
  };
  const input = name => ({
    actor,
    leadId: `${prefix}-${name}`,
    idempotencyKey: `${prefix}-${name}`,
    now: '2026-10-23T12:00:00.000Z',
  });
  let release;
  let pending = [];
  const observed = [];
  let mode = 'success';
  let pauseTimer;
  let entered;
  let unblock;
  const run = create({
    createOutboxPort(tx) {
      return {
        async appendEvent({ event }) {
          const payload = event.event;
          const [context] =
            await tx.execute(sql`select current_setting('app.current_tenant_id',true) as tenant,
        pg_backend_pid() as pid, txid_current()::text as transaction_id`);
          assert.equal(context.tenant, 'tenant_ks');
          // These reads must see the coordinator's preceding uncommitted writes on supplied tx.
          const [lead] = await tx.execute(
            sql`select agent_id from crm_leads where id=${payload.aggregateId}`
          );
          const audit = await tx.execute(sql`select id from crm_routing_assignments_audit
        where tenant_id=${payload.tenantId} and idempotency_key=${event.idempotencyKey}`);
          const ownership = await tx.execute(sql`select id from crm_lead_ownership_history
        where lead_id=${payload.aggregateId} and effective_to is null and agent_id=${lead.agent_id}`);
          const cursor = await tx.execute(sql`select last_idempotency_key from crm_routing_cursors
        where tenant_id=${payload.tenantId} and rule_id=${prefix}`);
          assert.equal(cursor.length, 1);
          assert.equal(cursor[0].last_idempotency_key, event.idempotencyKey);
          assert.equal(audit.length, 1);
          assert.equal(ownership.length, 1);
          assert.notEqual(lead.agent_id, agents[0]);
          await tx.execute(sql`insert into ${raw(table)} (id,tenant_id,lead_id,transaction_id)
        values (${event.id},${payload.tenantId},${payload.aggregateId},${context.transaction_id})`);
          await tx.execute(sql`select nextval(${sequence}::regclass)`);
          observed.push({ ...context, leadId: payload.aggregateId, agentId: lead.agent_id });
          if (mode === 'rollback') throw new Error('owned test-port failure after SQL insert');
          if (payload.aggregateId === `${prefix}-concurrent-a`) {
            entered(context.pid);
            await unblock;
          }
          return {
            status: 'enqueued',
            outboxEvent: {
              ...event,
              aggregateId: payload.aggregateId,
              aggregateType: payload.aggregateType,
              tenantId: payload.tenantId,
              type: payload.type,
              createdAt: event.availableAt,
              retryCount: 0,
              status: 'pending',
            },
          };
        },
      };
    },
  });
  async function snapshot() {
    const result = {};
    for (const [name, predicate] of [
      ['crm_leads', sql`id like ${prefix + '%'}`],
      ['crm_lead_ownership_history', sql`lead_id like ${prefix + '%'}`],
      ['crm_routing_cursors', sql`rule_id=${prefix}`],
      ['crm_routing_assignments_audit', sql`lead_id like ${prefix + '%'}`],
      [table, sql`true`],
    ])
      result[name] = await dbAdmin.execute(sql`select to_jsonb(t) as row from ${raw(name)} t
      where ${predicate} order by to_jsonb(t)::text`);
    return JSON.parse(JSON.stringify(result));
  }
  try {
    await dbAdmin.execute(
      raw(`CREATE TABLE ${table} (id text PRIMARY KEY,tenant_id text NOT NULL,
      lead_id text NOT NULL,transaction_id text NOT NULL);
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
      CREATE POLICY owned_tenant ON ${table} USING (tenant_id=current_setting('app.current_tenant_id',true))
        WITH CHECK (tenant_id=current_setting('app.current_tenant_id',true));
      GRANT SELECT,INSERT ON ${table} TO "${role}";
      CREATE SEQUENCE ${sequence}; GRANT USAGE,SELECT ON SEQUENCE ${sequence} TO "${role}";`)
    );
    await dbAdmin.execute(sql`insert into branches(id,tenant_id,name,slug)
      values (${branch},'tenant_ks',${branch},${branch})`);
    for (const id of agents)
      await dbAdmin.execute(sql`insert into "user"
      (id,tenant_id,name,email,"emailVerified",role,branch_id,"createdAt","updatedAt")
      values (${id},'tenant_ks',${id},${id + '@example.invalid'},false,'agent',${branch},now(),now())`);
    await dbAdmin.execute(sql`insert into crm_routing_rules
      (id,tenant_id,branch_id,source,strategy,priority,agent_pool)
      values (${prefix},'tenant_ks',${branch},${prefix},'round_robin',0,${JSON.stringify(agents.slice(1))}::jsonb)`);
    for (const name of leads) {
      const tenant = name === 'foreign' ? 'tenant_mk' : 'tenant_ks';
      const agent = name === 'foreign' ? 'crm-agent-MK' : agents[0];
      await dbAdmin.execute(sql`insert into crm_leads(id,tenant_id,agent_id,branch_id,type,source,stage)
        values (${prefix + '-' + name},${tenant},${agent},${name === 'foreign' ? null : branch},
        'individual',${prefix},'new')`);
      if (name !== 'foreign')
        await dbAdmin.execute(sql`insert into crm_lead_ownership_history
        (id,tenant_id,lead_id,agent_id,branch_id,effective_from,reason,changed_by_id)
        values (${prefix + '-history-' + name},'tenant_ks',${prefix + '-' + name},${agents[0]},
        ${branch},'2026-10-01','fixture',${admin.id})`);
    }
    const success = await run(input('success'));
    assert.equal(success.outcome, 'routed');
    assert.equal(success.ownershipChanged, true);
    assert.equal(observed.length, 1);
    const stable = await snapshot();
    assert.deepEqual(await run(input('foreign')), { outcome: 'rejected', reason: 'tenant_scope' });
    assert.deepEqual(await run({ ...input('rollback'), actor: { ...actor, role: 'member' } }), {
      outcome: 'rejected',
      reason: 'role_scope',
    });
    assert.deepEqual(await run({ ...input('rollback'), actor: { ...actor, tenantId: '' } }), {
      outcome: 'rejected',
      reason: 'tenant_scope',
    });
    assert.deepEqual(await snapshot(), stable);
    assert.equal(observed.length, 1);
    mode = 'rollback';
    assert.deepEqual(await run(input('rollback')), { outcome: 'repository_failure' });
    assert.equal(observed.length, 2, 'test outbox SQL reached after ownership and audit writes');
    assert.equal(
      (await dbAdmin.execute(raw(`select last_value::int as n from ${sequence}`)))[0].n,
      2
    );
    assert.deepEqual(
      await snapshot(),
      stable,
      'ownership, history, cursor, audit and test outbox all roll back'
    );
    mode = 'success';
    const started = new Promise(resolve => {
      entered = resolve;
    });
    unblock = new Promise(resolve => {
      release = resolve;
    });
    const first = run(input('concurrent-a'));
    pending.push(first);
    const pid = await Promise.race([
      started,
      first.then(() => {
        throw new Error('first did not pause');
      }),
      new Promise((_, reject) => {
        pauseTimer = setTimeout(() => reject(new Error('first routing pause timeout')), 10000);
      }),
    ]);
    clearTimeout(pauseTimer);
    const second = run(input('concurrent-b'));
    pending.push(second);
    const deadline = Date.now() + 10000;
    let blocked = false;
    while (Date.now() < deadline) {
      const rows = await dbAdmin.execute(sql`select pid from pg_stat_activity
        where datname=current_database() and ${pid} = any(pg_blocking_pids(pid))`);
      if (rows.length) {
        blocked = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(blocked, 'second actual transaction waits on first cursor write');
    release();
    const pair = await Promise.all(pending);
    assert.ok(pair.every(result => result.outcome === 'routed'));
    assert.notEqual(pair[0].agentId, pair[1].agentId, 'cursor retry preserves round robin');
    const committed = await dbAdmin.execute(
      sql`select lead_id,transaction_id from ${raw(table)} order by lead_id`
    );
    assert.equal(committed.length, 3);
    assert.equal(new Set(committed.map(row => row.transaction_id)).size, 3);
    const [context] = await db.execute(
      sql`select current_setting('app.current_tenant_id',true) as tenant`
    );
    assert.ok(!context.tenant);
    return [
      'PASS: actual routing ownership coordinator commits tenant ownership, cursor and audit with supplied-tx TEST SQL outbox port.',
      'PASS: foreign lead, forbidden role and missing tenant leave complete owned state unchanged.',
      'PASS: reached TEST outbox SQL insert then failure rolls back ownership, cursor, audit and test outbox together.',
      'PASS: observed cursor lock contention serializes two real routing transactions with distinct round-robin assignments; tenant context clears.',
    ];
  } finally {
    clearTimeout(pauseTimer);
    release?.();
    await Promise.allSettled(pending);
    await dbAdmin.execute(
      sql`delete from crm_routing_assignments_audit where lead_id like ${prefix + '%'}`
    );
    await dbAdmin.execute(
      sql`delete from crm_lead_ownership_history where lead_id like ${prefix + '%'}`
    );
    await dbAdmin.execute(sql`delete from crm_leads where id like ${prefix + '%'}`);
    await dbAdmin.execute(sql`delete from crm_routing_rules where id=${prefix}`);
    await dbAdmin.execute(
      sql`delete from "user" where id in (${agents[0]},${agents[1]},${agents[2]})`
    );
    await dbAdmin.execute(sql`delete from branches where id=${branch}`);
    await dbAdmin.execute(
      raw(`DROP TABLE IF EXISTS ${table}; DROP SEQUENCE IF EXISTS ${sequence}`)
    );
  }
}
