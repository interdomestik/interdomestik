import assert from 'node:assert/strict';
import { runStaffDefaultCanonicalAssertions } from './db-access-crm-runtime-cases-staff.mjs';
async function runCrmReportingCases() {
  const checks = [];
  const { dbAdmin, db, assertRlsConnectionRoleReady } = await import('./crm-runtime.cjs');
  const { sql } = await import('drizzle-orm');
  const schema = await import('./crm-runtime.cjs');
  await assertRlsConnectionRoleReady();
  const admin = await dbAdmin.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, 'admin.ks@interdomestik.com'),
  });
  const foreign = await dbAdmin.query.user.findFirst({
    where: (u, { and, ne, eq }) => and(ne(u.tenantId, admin.tenantId), eq(u.role, 'agent')),
  });
  assert.ok(admin?.tenantId && foreign?.tenantId);
  const now = '2026-10-22T12:00:00.000Z';
  for (const [label, tenantId, agentId] of [
    ['home', admin.tenantId, admin.id],
    ['foreign', foreign.tenantId, foreign.id],
  ]) {
    const pipelineId = 'owned-report-' + label,
      stageId = pipelineId + '-stage';
    await dbAdmin
      .insert(schema.crmPipelines)
      .values({ id: pipelineId, tenantId, name: pipelineId });
    await dbAdmin
      .insert(schema.crmPipelineStages)
      .values({ id: stageId, tenantId, pipelineId, name: 'Open', order: 1, probability: 50 });
    await dbAdmin.insert(schema.crmDeals).values({
      id: pipelineId + '-deal',
      tenantId,
      agentId,
      pipelineId,
      currentStageId: stageId,
      stage: 'proposal',
      status: 'open',
      forecastCategory: 'pipeline',
      currencyCode: 'EUR',
      valueAmountMinor: label === 'home' ? 1e4 : 99900,
      expectedCloseAt: new Date(now),
      createdAt: /* @__PURE__ */ new Date('2026-10-20T12:00:00Z'),
    });
    await dbAdmin.insert(schema.crmPipelineSnapshots).values({
      id: pipelineId + '-snapshot',
      tenantId,
      pipelineId,
      snapshotDate: '2026-10-21',
      snapshotVersion: 1,
      currencyCode: 'EUR',
      openDealCount: 1,
      rawValueAmountMinor: label === 'home' ? 1e4 : 99900,
      weightedValueAmountMinor: 5e3,
      forecastPipelineAmountMinor: 1e4,
      forecastBestAmountMinor: 0,
      forecastCommitAmountMinor: 0,
      forecastOmittedAmountMinor: 0,
      closedWonAmountMinor: 0,
      closedLostAmountMinor: 0,
      sourceRunId: 'owned-report-run',
      createdAt: /* @__PURE__ */ new Date('2026-10-22T11:00:00Z'),
    });
  }
  const { getAdminCrmReportingCore, createAdminCrmReportingTenantRepositories } =
    await import('./crm-runtime.cjs');
  const actor = {
    actorId: admin.id,
    role: 'admin',
    scope: { branchId: null },
    tenantId: admin.tenantId,
  };
  const options = { now: () => now, logger: { error: () => {} } };
  const result = await getAdminCrmReportingCore({ actor }, options);
  for (const name of ['snapshot', 'branchPipeline', 'sourceBreakdown', 'forecastObservability'])
    assert.equal(result[name].state, 'data', name);
  assert.ok(result.snapshot.rows.some(r => r.pipelineId === 'owned-report-home'));
  assert.ok(result.branchPipeline.rows.some(r => r.pipelineId === 'owned-report-home'));
  assert.ok(!JSON.stringify(result).includes('owned-report-foreign'));
  await assert.rejects(() =>
    getAdminCrmReportingCore({ actor: { ...actor, role: 'member' } }, options)
  );
  await assert.rejects(() =>
    getAdminCrmReportingCore({ actor: { ...actor, tenantId: '' } }, options)
  );
  const repositories = createAdminCrmReportingTenantRepositories(admin.tenantId);
  for (const name of [
    'listAgentLeaderboardRows',
    'listFunnelConversionRows',
    'listStageVelocityRows',
    'listWinRateRows',
  ]) {
    const rows = await repositories.reportingRepository[name]({ actor, window: result.window });
    assert.ok(Array.isArray(rows));
    assert.ok(rows.every(row => row.tenantId === admin.tenantId));
  }
  await assert.rejects(
    () => repositories.forecastSnapshotRepository.insertPipelineSnapshots({ snapshots: [] }),
    /read-only/
  );
  const { createCrmReportingRepository, createCrmForecastSnapshotRepository } =
    await import('./crm-runtime.cjs');
  assert.deepEqual(
    await createCrmReportingRepository().listWeightedPipelineRows({ actor, window: result.window }),
    []
  );
  assert.deepEqual(
    await createCrmForecastSnapshotRepository().listLatestPipelineSnapshots({
      tenantId: admin.tenantId,
      snapshotDate: '2026-10-21',
    }),
    []
  );
  checks.push(
    'PASS: all tenant-bound repository read methods execute; snapshot writes refuse; ambient reads cannot see seeded tenant rows.'
  );
  const role = process.env.DB_RLS_ROLE;
  assert.match(role, /^s8_crm_app_[a-f0-9]+$/);
  const columns = await dbAdmin.execute(
    sql.raw(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_pipeline_snapshots' AND column_name <> 'raw_value_amount_minor' ORDER BY ordinal_position"
    )
  );
  const names = columns.map(r => '"' + String(r.column_name).replaceAll('"', '""') + '"').join(',');
  await dbAdmin.execute(
    sql.raw(
      'REVOKE SELECT ON crm_pipeline_snapshots FROM "' +
        role +
        '"; GRANT SELECT (' +
        names +
        ') ON crm_pipeline_snapshots TO "' +
        role +
        '"'
    )
  );
  try {
    const failed = await getAdminCrmReportingCore({ actor }, options);
    assert.equal(failed.snapshot.state, 'error');
    for (const name of ['branchPipeline', 'sourceBreakdown', 'forecastObservability']) {
      assert.equal(failed[name].state, 'data', name);
      assert.deepEqual(failed[name], result[name], name + ' preserves healthy result');
    }
    checks.push(
      'PASS: actual snapshot SELECT permission error is isolated; all three healthy widget results remain unchanged.'
    );
  } finally {
    await dbAdmin.execute(sql.raw('GRANT SELECT ON crm_pipeline_snapshots TO "' + role + '"'));
  }
  const context = await db.execute(
    sql.raw("SELECT current_setting('app.current_tenant_id',true) AS tenant")
  );
  assert.ok(!context[0].tenant, 'tenant context must not leak');
  await assertRlsConnectionRoleReady();
  checks.push(
    'PASS: own tenant reporting data, foreign exclusion, actor denial, restricted LOGIN and context cleanup.'
  );
  checks.push(...(await runStaffDefaultCanonicalAssertions()));
  return checks;
}
export { runCrmReportingCases };
