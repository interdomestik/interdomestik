import assert from 'node:assert/strict';
import { runActionContext, assertContextClear } from './db-access-crm-runtime-context.mjs';
export async function runCrmAgentFlowCases() {
  const runtime = await import('./crm-runtime.cjs');
  const {
    dbAdmin,
    crmLeads,
    crmDeals,
    assertRlsConnectionRoleReady,
    getAgentCrmLeadDetail,
    crmLeadDetailRepository: patched,
    crmLeadActivityRepository: activities,
    listCrmLeadFollowUpTasksForLead: tasks,
    crmDashboardRepository: dashboard,
    agentCrmTaskWorkQueueRepository: queue,
  } = runtime;
  const { sql } = await import('drizzle-orm');
  const schedule = async (args) =>
    (await runActionContext(() => runtime.scheduleAgentLeadFollowUpCore(args))).result;
  const complete = async (args) =>
    (await runActionContext(() => runtime.completeAgentLeadFollowUpCore(args))).result;
  await assertRlsConnectionRoleReady();
  const tenant = await dbAdmin.query.tenants.findFirst();
  assert.ok(tenant);
  const branchId = 'owned-agent-flow-branch';
  await dbAdmin
    .insert(runtime.branches)
    .values({ id: branchId, tenantId: tenant.id, name: 'Owned agent branch', slug: branchId });
  const agent = {
    id: 'owned-agent-flow-agent',
    tenantId: tenant.id,
    branchId,
    role: 'agent',
    name: 'Owned agent',
    email: 'owned-agent-flow@example.invalid',
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await dbAdmin.insert(runtime.user).values(agent);
  const actor = {
    actorId: agent.id,
    role: 'agent',
    scope: { agentId: agent.id, branchId: agent.branchId },
    tenantId: agent.tenantId,
  };
  const id = 'owned-agent-detail-probe';
  await dbAdmin
    .insert(crmLeads)
    .values({
      id,
      tenantId: agent.tenantId,
      agentId: agent.id,
      branchId: agent.branchId,
      type: 'individual',
      fullName: 'Owned detail probe',
      stage: 'new',
    });
  await dbAdmin
    .insert(crmDeals)
    .values({
      id: 'owned-agent-detail-deal',
      tenantId: agent.tenantId,
      agentId: agent.id,
      leadId: id,
      valueCents: 100,
      stage: 'proposal',
      status: 'open',
    });

  const own = await getAgentCrmLeadDetail({ actor, leadId: id }, patched);
  assert.equal(own.success, true);
  assert.equal(own.deals.length, 1);
  for (const changed of [
    { ...actor, tenantId: 'other-tenant' },
    { ...actor, actorId: 'other-agent', scope: { ...actor.scope, agentId: 'other-agent' } },
    { ...actor, scope: { ...actor.scope, branchId: 'other-branch' } },
  ])
    assert.equal(
      (await getAgentCrmLeadDetail({ actor: changed, leadId: id }, patched)).success,
      false
    );
  for (const changed of [
    { ...actor, role: 'member' },
    { ...actor, scope: { ...actor.scope, branchId: null } },
  ])
    assert.equal(
      (await getAgentCrmLeadDetail({ actor: changed, leadId: id }, patched)).error,
      'forbidden'
    );

  const session = {
    user: { id: agent.id, role: 'agent', tenantId: agent.tenantId, branchId: agent.branchId },
  };
  assert.ok(await activities.findAgentLead({ actor, leadId: id }));
  assert.equal(
    (await activities.listAgentLeadActivities({ actor, lead: own.lead, limit: 25 })).length,
    0
  );
  const scheduledAt = new Date(Date.now() - 60000).toISOString();
  const scheduled = await schedule({
    session,
    leadId: id,
    subject: 'Owned follow-up',
    scheduledAt,
    requestHeaders: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
  });
  assert.equal(scheduled.success, true);
  const again = await schedule({ session, leadId: id, subject: 'Owned follow-up', scheduledAt });
  assert.equal(again.success, true);
  assert.equal(again.activity.id, scheduled.activity.id);
  const list = await tasks({ actor, leadId: id });
  assert.equal(list.length, 1);
  const queueRows = await queue.readAgentTaskWorkQueue({ actor, now: new Date().toISOString() });
  assert.ok(queueRows.some((x) => x.taskId === scheduled.activity.id));
  const dashboardRows = await dashboard.readAgentDashboard({
    actor,
    limit: 25,
    now: new Date().toISOString(),
  });
  assert.ok(dashboardRows.dueFollowUps.some((x) => x.leadId === id));
  const stale = await complete({
    session,
    leadId: id,
    activityId: scheduled.activity.id,
    source: 'crm_task',
    expectedLifecycleVersion: list[0].expectedLifecycleVersion + 1,
  });
  assert.equal(stale.success, false);
  assert.equal(stale.error, 'conflict');
  const completed = await complete({
    session,
    leadId: id,
    activityId: scheduled.activity.id,
    source: 'crm_task',
    expectedLifecycleVersion: list[0].expectedLifecycleVersion,
  });
  assert.equal(completed.success, true);
  assert.equal((await tasks({ actor, leadId: id })).length, 0);
  for (const bad of [
    null,
    { user: { ...session.user, role: 'member' } },
    { user: { ...session.user, branchId: null } },
    { user: { ...session.user, tenantId: 'other-tenant' } },
    { user: { ...session.user, id: 'other-agent' } },
  ]) {
    const denied = await schedule({ session: bad, leadId: id, subject: 'Denied', scheduledAt });
    assert.equal(denied.success, false);
  }
  const legacyId = 'owned-legacy-followup';
  await dbAdmin.execute(
    sql`insert into crm_activities (id,tenant_id,agent_id,branch_id,lead_id,type,summary,scheduled_at,created_at) values (${legacyId},${actor.tenantId},${actor.actorId},${actor.scope.branchId},${id},'follow_up','Legacy owned',${scheduledAt},now())`
  );
  const visibleActivities = await activities.listAgentLeadActivities({
    actor,
    lead: own.lead,
    limit: 25,
  });
  assert.ok(visibleActivities.some((x) => x.id === legacyId));
  const legacyCompleted = await complete({
    session,
    leadId: id,
    activityId: legacyId,
    source: 'legacy_activity',
  });
  assert.equal(legacyCompleted.success, true);
  assert.ok(legacyCompleted.activity.completedAt);
  await runtime.getAgentCrmReportingCore({ actor });
  const completedQueue = await queue.readAgentCompletedTaskQueue({
    actor,
    now: new Date().toISOString(),
  });
  assert.ok(completedQueue.some((x) => x.taskId === scheduled.activity.id));
  for (const changed of [
    { ...actor, tenantId: 'other-tenant' },
    { ...actor, actorId: 'other-agent', scope: { ...actor.scope, agentId: 'other-agent' } },
    { ...actor, scope: { ...actor.scope, branchId: 'other-branch' } },
  ]) {
    assert.equal((await tasks({ actor: changed, leadId: id })).length, 0);
    assert.equal(
      (await activities.listAgentLeadActivities({ actor: changed, lead: own.lead, limit: 25 }))
        .length,
      0
    );
    assert.equal(
      (
        await queue.readAgentCompletedTaskQueue({ actor: changed, now: new Date().toISOString() })
      ).some((x) => x.taskId === scheduled.activity.id),
      false
    );
  }
  await dbAdmin.execute(sql`alter table agent_commissions rename to owned_commissions_hidden`);
  try {
    const independent = await Promise.allSettled([
      dashboard.readAgentDashboard({ actor, limit: 25, now: new Date().toISOString() }),
      patched.findAgentLead({ actor, leadId: id }),
    ]);
    assert.equal(independent[0].status, 'rejected');
    assert.equal(independent[1].status, 'fulfilled');
    assert.ok(independent[1].value);
  } finally {
    await dbAdmin.execute(sql`alter table owned_commissions_hidden rename to agent_commissions`);
  }
  assert.ok(
    (await dashboard.readAgentDashboard({ actor, limit: 25, now: new Date().toISOString() }))
      .leadCounts
  );
  await assertContextClear(runtime);
  return [
    'actual agent detail/activity/task scheduling/replay/stale completion/legacy completion/reporting/queues',
    'tenant/agent/branch/session denials; SQL aggregate failure rejects; independent sibling read succeeds and aggregate recovers',
  ];
}
