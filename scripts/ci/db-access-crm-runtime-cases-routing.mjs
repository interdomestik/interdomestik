import assert from 'node:assert/strict';
async function runCrmRoutingCases() {
  const checks = [];
  const { dbAdmin, assertRlsConnectionRoleReady } = await import('./crm-runtime.cjs');
  await assertRlsConnectionRoleReady();
  const { withTenantContext } = await import('./crm-runtime.cjs');
  const { createAdminCrmRoutingRuleRepository } = await import('./crm-runtime.cjs');
  const { runUnboundAdminCrmRoutingRuleAction: runAdminCrmRoutingRuleAction } =
    await import('./crm-runtime.cjs');
  const admin = await dbAdmin.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, 'admin.ks@interdomestik.com'),
  });
  assert.ok(admin?.tenantId);
  const agent = await dbAdmin.query.user.findFirst({
    where: (u, { and, eq }) => and(eq(u.tenantId, admin.tenantId), eq(u.role, 'agent')),
  });
  assert.ok(agent?.id);
  const args = {
    kind: 'create',
    session: { user: { id: admin.id, role: 'admin', tenantId: admin.tenantId } },
    input: {
      agentIds: [agent.id],
      priority: 1001,
      source: 'owned-crm-routing-diagnosis',
      strategy: 'round_robin',
      branchId: null,
    },
  };
  const { runAdminCrmRoutingRuleAction: runBound, getAdminCrmRoutingRulesCore: readBound } =
    await import('./crm-runtime.cjs');
  const result = await runBound(args);
  assert.equal(result.status, 'ok');
  const actor = {
    actorId: admin.id,
    role: 'admin',
    scope: { branchId: null },
    tenantId: admin.tenantId,
  };
  const listed = await readBound({ actor });
  assert.ok(listed.rules.some(rule => rule.filters.source === 'owned-crm-routing-diagnosis'));
  const otherAgent = await dbAdmin.query.user.findFirst({
    where: (u, { and, ne, eq }) => and(ne(u.tenantId, admin.tenantId), eq(u.role, 'agent')),
  });
  assert.ok(otherAgent);
  const denied = await runBound({
    ...args,
    input: { ...args.input, agentIds: [otherAgent.id], source: 'owned-cross-tenant-denied' },
  });
  assert.deepEqual(denied, { field: 'agentIds', reason: 'cross_tenant_agent', status: 'error' });
  const forbidden = await runBound({
    ...args,
    session: { user: { ...args.session.user, role: 'member' } },
  });
  assert.deepEqual(forbidden, { reason: 'forbidden', status: 'error' });
  checks.push(
    'PASS: actual production boundary creates and lists own-tenant rule; cross-tenant agent and member actor rejected under restricted LOGIN.'
  );
  const { sql } = await import('drizzle-orm');
  await dbAdmin.execute(
    sql.raw(`CREATE SEQUENCE owned_crm_insert_attempt;
CREATE FUNCTION owned_crm_invalid_timestamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.source LIKE 'owned-postwrite-%' THEN NEW.created_at := 'infinity'::timestamptz; END IF; RETURN NEW; END $$;
CREATE TRIGGER owned_crm_invalid_timestamp BEFORE INSERT ON crm_routing_rules FOR EACH ROW EXECUTE FUNCTION owned_crm_invalid_timestamp();
CREATE FUNCTION owned_crm_record_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NEW.source LIKE 'owned-postwrite-%' THEN PERFORM nextval('owned_crm_insert_attempt'); END IF; RETURN NEW; END $$;
CREATE TRIGGER owned_crm_record_insert AFTER INSERT ON crm_routing_rules FOR EACH ROW EXECUTE FUNCTION owned_crm_record_insert();`)
  );
  const beforeFix = await withTenantContext({ tenantId: admin.tenantId }, tx =>
    runAdminCrmRoutingRuleAction(
      { ...args, input: { ...args.input, source: 'owned-postwrite-control' } },
      { repository: createAdminCrmRoutingRuleRepository(tx) }
    )
  );
  assert.deepEqual(beforeFix, { status: 'error', reason: 'repository_failure' });
  const control = await dbAdmin.execute(
    sql.raw(
      "SELECT count(*)::int AS n FROM crm_routing_rules WHERE source='owned-postwrite-control'"
    )
  );
  assert.equal(control[0].n, 1);
  const rolledBack = await runBound({
    ...args,
    input: { ...args.input, source: 'owned-postwrite-bound' },
  });
  assert.deepEqual(rolledBack, { status: 'error', reason: 'repository_failure' });
  const missing = await dbAdmin.execute(
    sql.raw("SELECT count(*)::int AS n FROM crm_routing_rules WHERE source='owned-postwrite-bound'")
  );
  assert.equal(missing[0].n, 0);
  const attempts = await dbAdmin.execute(
    sql.raw('SELECT last_value::int AS n FROM owned_crm_insert_attempt')
  );
  assert.equal(attempts[0].n, 2);
  checks.push(
    'PASS: actual AFTER INSERT witness observed both SQL writes; control committed on returned error, production wrapper rolled back while preserving repository_failure.'
  );
  await dbAdmin.execute(
    sql.raw("DELETE FROM crm_routing_rules WHERE source='owned-postwrite-control'")
  );
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') throw new Error('create failed');
  const first = listed.rules.find(r => r.id === result.ruleId);
  const second = await runBound({
    ...args,
    input: { ...args.input, source: 'owned-second', priority: 1002 },
  });
  assert.equal(second.status, 'ok');
  if (second.status !== 'ok') throw new Error('second create failed');
  const updated = await runBound({
    ...args,
    kind: 'update',
    input: {
      ...args.input,
      source: 'owned-updated',
      ruleId: first.id,
      expectedUpdatedAt: first.updatedAt,
      priority: 1003,
    },
  });
  assert.equal(updated.status, 'ok');
  const stale = await runBound({
    ...args,
    kind: 'update',
    input: { ...args.input, ruleId: first.id, expectedUpdatedAt: '2000-01-01T00:00:00.000Z' },
  });
  assert.deepEqual(stale, { status: 'error', reason: 'cursor_conflict' });
  const allRules = (await readBound({ actor })).rules
    .filter(r => !r.archived && r.scope.kind === 'tenant')
    .map(r => r.id);
  const orderedIds = [
    second.ruleId,
    first.id,
    ...allRules.filter(id => id !== second.ruleId && id !== first.id),
  ];
  const reordered = await runBound({
    ...args,
    kind: 'reorder',
    input: { branchId: null, ruleIds: orderedIds },
  });
  assert.equal(reordered.status, 'ok');
  const reorderedList = await readBound({ actor });
  assert.ok(
    reorderedList.rules.find(r => r.id === second.ruleId).priority <
      reorderedList.rules.find(r => r.id === first.id).priority
  );
  const disabled = await runBound({
    ...args,
    kind: 'set_enabled',
    input: { ruleId: first.id, enabled: false },
  });
  assert.equal(disabled.status, 'ok');
  assert.equal((await readBound({ actor })).rules.find(r => r.id === first.id).enabled, false);
  const archived = await runBound({ ...args, kind: 'archive', input: { ruleId: first.id } });
  assert.equal(archived.status, 'ok');
  assert.equal((await readBound({ actor })).rules.find(r => r.id === first.id).archived, true);
  assert.equal(
    (await runBound({ ...args, kind: 'archive', input: { ruleId: first.id } })).status,
    'ok'
  );
  const foreignAdmin = await dbAdmin.query.user.findFirst({
    where: (u, { and, ne, eq }) => and(ne(u.tenantId, admin.tenantId), eq(u.role, 'admin')),
  });
  assert.ok(foreignAdmin?.tenantId);
  const foreignPoolAgent = await dbAdmin.query.user.findFirst({
    where: (u, { and, eq }) => and(eq(u.tenantId, foreignAdmin.tenantId), eq(u.role, 'agent')),
  });
  assert.ok(foreignPoolAgent);
  const foreignRule = await runBound({
    ...args,
    session: { user: { id: foreignAdmin.id, tenantId: foreignAdmin.tenantId, role: 'admin' } },
    input: { ...args.input, agentIds: [foreignPoolAgent.id], source: 'owned-foreign' },
  });
  assert.equal(foreignRule.status, 'ok');
  if (foreignRule.status !== 'ok') throw new Error('foreign fixture rule failed');
  assert.deepEqual(
    await runBound({
      ...args,
      kind: 'set_enabled',
      input: { ruleId: foreignRule.ruleId, enabled: false },
    }),
    { status: 'error', reason: 'not_found' }
  );
  assert.deepEqual(
    await runBound({
      ...args,
      kind: 'reorder',
      input: { branchId: null, ruleIds: [second.ruleId, foreignRule.ruleId] },
    }),
    { status: 'error', reason: 'branch_incompatible_rule' }
  );
  assert.deepEqual(
    await runBound({
      ...args,
      kind: 'reorder',
      input: { branchId: null, ruleIds: [second.ruleId, second.ruleId] },
    }),
    { status: 'error', reason: 'duplicate_rule_id', field: 'ruleIds' }
  );
  assert.deepEqual(
    await runBound({ ...args, input: { ...args.input, agentIds: [agent.id, agent.id] } }),
    { status: 'error', reason: 'duplicate_agent_id', field: 'agentIds' }
  );
  assert.equal(
    (await runBound({ ...args, input: { ...args.input, priority: -1 } })).status,
    'error'
  );
  assert.deepEqual(
    await runBound({ ...args, session: { user: { id: admin.id, role: 'admin' } } }),
    { status: 'error', reason: 'forbidden' }
  );
  const foreignBranch = await dbAdmin.query.branches.findFirst({
    where: (b, { eq }) => eq(b.tenantId, foreignAdmin.tenantId),
  });
  assert.ok(foreignBranch);
  assert.deepEqual(
    await runBound({
      ...args,
      input: { ...args.input, agentIds: [], strategy: 'manual_only', branchId: foreignBranch.id },
    }),
    { status: 'error', reason: 'invalid_branch', field: 'branchId' }
  );
  const { db } = await import('./crm-runtime.cjs');
  const context = await db.execute(
    sql.raw(
      "SELECT current_setting('app.current_tenant_id',true) AS tenant,current_setting('app.current_access_tenant_id',true) AS access"
    )
  );
  assert.ok(!context[0].tenant && !context[0].access);
  await assertRlsConnectionRoleReady();
  checks.push(
    'PASS: actual own-tenant create/read/update/reorder/disable/archive, stale cursor, foreign rule/branch/agent, duplicate/invalid input, missing tenant and context cleanup.'
  );
  return checks;
}
export { runCrmRoutingCases };
