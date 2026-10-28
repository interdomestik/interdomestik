import assert from 'node:assert/strict';

export async function runCrmBranchManagerCases() {
  const api = await import('./crm-runtime.cjs');
  const { dbAdmin, db, getBranchManagerCrmReportingCore, assertRlsConnectionRoleReady } = api;
  const { sql } = await import('drizzle-orm');
  await assertRlsConnectionRoleReady();
  const now = '2026-10-22T12:00:00.000Z';
  for (const [label, tenantId, agentId] of [
    ['own', 'tenant_ks', 'crm-agent-KS'],
    ['other', 'tenant_ks', 'crm-agent-KS'],
    ['foreign', 'tenant_mk', 'crm-agent-MK'],
  ]) {
    const id = 'owned-branch-report-' + label;
    await dbAdmin.insert(api.branches).values({ id, tenantId, name: id, slug: id });
    await dbAdmin.insert(api.crmPipelines).values({ id, tenantId, name: id });
    await dbAdmin.insert(api.crmPipelineStages).values({
      id: id + '-stage',
      tenantId,
      pipelineId: id,
      name: 'Open',
      order: 1,
      probability: 50,
    });
    await dbAdmin.insert(api.crmDeals).values({
      id: id + '-deal',
      tenantId,
      agentId,
      branchId: id,
      pipelineId: id,
      currentStageId: id + '-stage',
      stage: 'proposal',
      status: 'open',
      forecastCategory: 'pipeline',
      currencyCode: 'EUR',
      valueAmountMinor: 10000,
      expectedCloseAt: new Date(now),
      createdAt: new Date('2026-10-20T12:00:00Z'),
    });
    await dbAdmin.insert(api.crmPipelineSnapshots).values({
      id: id + '-snapshot',
      tenantId,
      branchId: id,
      pipelineId: id,
      snapshotDate: '2026-10-21',
      snapshotVersion: 1,
      currencyCode: 'EUR',
      openDealCount: 1,
      rawValueAmountMinor: 10000,
      weightedValueAmountMinor: 5000,
      forecastPipelineAmountMinor: 10000,
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 0,
      forecastOmittedAmountMinor: 0,
      closedWonAmountMinor: 0,
      closedLostAmountMinor: 0,
      sourceRunId: 'owned-branch-report-run',
      createdAt: new Date('2026-10-22T11:00:00Z'),
    });
  }
  const actor = {
    actorId: 'crm-agent-KS',
    tenantId: 'tenant_ks',
    role: 'branch_manager',
    scope: { branchId: 'owned-branch-report-own' },
  };
  const options = { now: () => now, logger: { error() {} } };
  const result = await getBranchManagerCrmReportingCore({ actor }, options);
  for (const name of ['snapshot', 'branchPipeline', 'sourceBreakdown']) {
    assert.equal(result[name].state, 'data', name);
    assert.ok(result[name].rows.length > 0, name);
    assert.ok(
      result[name].rows.every(row => row.branchId === actor.scope.branchId),
      name
    );
  }
  assert.ok(!JSON.stringify(result).includes('owned-branch-report-other'));
  assert.ok(!JSON.stringify(result).includes('owned-branch-report-foreign'));
  for (const denied of [
    { ...actor, tenantId: '' },
    { ...actor, role: 'member' },
    { ...actor, scope: {} },
  ])
    await assert.rejects(() => getBranchManagerCrmReportingCore({ actor: denied }, options));
  const foreignBranch = await getBranchManagerCrmReportingCore(
    {
      actor: {
        ...actor,
        scope: { branchId: 'owned-branch-report-foreign' },
      },
    },
    options
  );
  for (const name of ['snapshot', 'branchPipeline', 'sourceBreakdown'])
    assert.deepEqual(foreignBranch[name].rows, []);
  const unbound = await api.createCrmReportingRepository().listWeightedPipelineRows({
    actor,
    window: result.window,
  });
  assert.deepEqual(unbound, []);
  const role = process.env.DB_RLS_ROLE;
  assert.match(role, /^s8_crm_app_[a-f0-9]+$/);
  await dbAdmin.execute(sql.raw('REVOKE SELECT ON crm_pipeline_snapshots FROM "' + role + '"'));
  try {
    const failed = await getBranchManagerCrmReportingCore({ actor }, options);
    assert.equal(failed.snapshot.state, 'error');
    for (const name of ['branchPipeline', 'sourceBreakdown'])
      assert.deepEqual(failed[name], result[name], name + ' survives sibling SQL failure');
  } finally {
    await dbAdmin.execute(sql.raw('GRANT SELECT ON crm_pipeline_snapshots TO "' + role + '"'));
  }
  const context = await db.execute(
    sql.raw("SELECT current_setting('app.current_tenant_id',true) AS tenant")
  );
  assert.ok(!context[0].tenant);
  await assertRlsConnectionRoleReady();
  return [
    'own-branch-data',
    'other-branch-and-tenant-excluded',
    'unauthorized-actor-denied',
    'ambient-control-empty',
    'snapshot-sql-failure-preserves-two-healthy-widgets',
    'context-cleaned',
  ];
}
