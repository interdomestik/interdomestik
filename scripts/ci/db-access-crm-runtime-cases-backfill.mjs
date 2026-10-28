import assert from 'node:assert/strict';
import { sql, eq } from 'drizzle-orm';

export async function runCrmBackfillCases() {
  const app = await import('./crm-runtime.cjs');
  const {
    dbAdmin,
    db,
    runAdminCrmForecastBackfillOperatorCore: run,
    runUnboundCrmForecastSnapshotBackfillCore: control,
  } = app;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  for (const [suffix, tenantId, agentId] of [
    ['good', 'tenant_ks', 'crm-agent-KS'],
    ['fail', 'tenant_ks', 'crm-agent-KS'],
    ['foreign', 'tenant_mk', 'crm-agent-MK'],
  ]) {
    const id = 'owned-backfill-' + suffix;
    await dbAdmin.insert(app.crmPipelines).values({ id, tenantId, name: id });
    await dbAdmin.insert(app.crmPipelineStages).values({
      id: id + '-stage',
      tenantId,
      pipelineId: id,
      name: 'Open',
      order: 1,
      probability: 50,
    });
    await dbAdmin.insert(app.crmDeals).values({
      id: id + '-deal',
      tenantId,
      agentId,
      pipelineId: id,
      currentStageId: id + '-stage',
      stage: 'proposal',
      status: 'open',
      forecastCategory: 'pipeline',
      currencyCode: 'EUR',
      valueAmountMinor: 10000,
      expectedCloseAt: now,
      createdAt: new Date(yesterday + 'T12:00:00Z'),
    });
  }
  const request = { tenantId: 'tenant_ks', fromDate: yesterday, toDate: yesterday };
  const session = { user: { id: 'crm-admin-KS', role: 'admin', tenantId: 'tenant_ks' } };
  const options = {
    headers: new Headers({ 'x-forwarded-for': '127.0.0.1' }),
    logger: { info() {}, warn() {}, error() {} },
  };
  const ambient = await control({ ...request, now, dryRun: true, logger: options.logger });
  assert.equal(ambient.workItemsConsidered, 0, 'control must expose ambient RLS-empty result');
  const snapshots = () =>
    dbAdmin.query.crmPipelineSnapshots.findMany({
      where: eq(app.crmPipelineSnapshots.snapshotDate, yesterday),
    });
  const before = await snapshots();
  const preview = await run({ session, input: { mode: 'dry_run', request } }, options);
  assert.equal(preview.success, true);
  assert.ok(preview.result.workItemsConsidered >= 2);
  assert.ok(preview.result.confirmationToken);
  assert.deepEqual(await snapshots(), before);
  assert.deepEqual(await run({ session, input: { mode: 'write', request } }, options), {
    success: false,
    errorCode: 'confirmation_invalid',
    result: null,
  });
  assert.deepEqual(
    await run(
      { session, input: { mode: 'dry_run', request: { ...request, tenantId: 'tenant_mk' } } },
      options
    ),
    { success: false, errorCode: 'invalid_tenant', result: null }
  );
  assert.deepEqual(
    await run(
      {
        session: { user: { ...session.user, role: 'member' } },
        input: { mode: 'dry_run', request },
      },
      options
    ),
    { success: false, errorCode: 'unauthorized', result: null }
  );
  assert.deepEqual(await run({ session: null, input: { mode: 'dry_run', request } }, options), {
    success: false,
    errorCode: 'unauthorized',
    result: null,
  });
  await dbAdmin.execute(
    sql.raw(`CREATE FUNCTION owned_crm_backfill_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.pipeline_id='owned-backfill-fail' THEN RAISE EXCEPTION 'owned fixture snapshot failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER owned_crm_backfill_failure BEFORE INSERT ON crm_pipeline_snapshots FOR EACH ROW EXECUTE FUNCTION owned_crm_backfill_failure();`)
  );
  const confirmed = { mode: 'write', request, confirmationToken: preview.result.confirmationToken };
  const written = await run({ session, input: confirmed }, options);
  assert.equal(written.success, true);
  assert.equal(written.result.status, 'partial');
  assert.equal(written.result.workItemsFailed, 1);
  assert.ok(written.result.snapshotsInserted >= 1);
  const after = await snapshots();
  assert.ok(
    after.some(row => row.pipelineId === 'owned-backfill-good' && row.tenantId === 'tenant_ks')
  );
  assert.ok(
    !after.some(
      row => row.pipelineId === 'owned-backfill-fail' || row.pipelineId === 'owned-backfill-foreign'
    )
  );
  assert.deepEqual(await run({ session, input: confirmed }, options), {
    success: false,
    errorCode: 'confirmation_invalid',
    result: null,
  });
  assert.deepEqual(await snapshots(), after);
  const context = await db.execute(
    sql.raw("SELECT current_setting('app.current_tenant_id',true) AS tenant")
  );
  assert.ok(!context[0].tenant);
  await app.assertRlsConnectionRoleReady();
  return [
    'ambient-control-sees-no-work',
    'dry-run-sees-own-work-without-writes',
    'actor-and-tenant-denials',
    'confirmed-write-executes',
    'foreign-tenant-excluded',
    'failed-write-preserves-healthy-work-items',
    'confirmation-replay-rejected',
    'context-cleaned',
  ];
}
