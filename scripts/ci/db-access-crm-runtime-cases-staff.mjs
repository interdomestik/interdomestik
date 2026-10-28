import assert from 'node:assert/strict';

export async function runStaffDefaultCanonicalAssertions() {
  const { sql } = await import('drizzle-orm');
  const app = await import('./crm-runtime.cjs');
  const { dbAdmin, db, getStaffCrmReportingCore: run } = app;
  assert.equal(typeof run, 'function');
  await app.assertRlsConnectionRoleReady();
  const now = '2026-10-22T12:00:00.000Z';
  for (const [suffix, tenantId] of [
    ['home', 'tenant_ks'],
    ['foreign', 'tenant_mk'],
  ]) {
    const staffId = `owned-staff-${suffix}`;
    const pipelineId = staffId + '-pipeline';
    await dbAdmin
      .insert(app.user)
      .values({
        id: staffId,
        tenantId,
        name: staffId,
        email: staffId + '@example.invalid',
        emailVerified: false,
        role: 'staff',
        createdAt: new Date(now),
        updatedAt: new Date(now),
      });
    await dbAdmin.insert(app.crmPipelines).values({ id: pipelineId, tenantId, name: pipelineId });
    for (const ordinal of [1, 2]) {
      await dbAdmin
        .insert(app.crmPipelineStages)
        .values({
          id: pipelineId + '-stage-' + ordinal,
          tenantId,
          pipelineId,
          name: 'Stage ' + ordinal,
          order: ordinal,
          probability: 50,
        });
    }
    for (const ordinal of [1, 2, 3]) {
      const dealId = pipelineId + '-deal-' + ordinal;
      await dbAdmin
        .insert(app.crmDeals)
        .values({
          id: dealId,
          tenantId,
          pipelineId,
          agentId: suffix === 'home' ? 'crm-agent-KS' : 'crm-agent-MK',
          currentStageId: pipelineId + '-stage-2',
          stage: 'proposal',
          status: 'open',
          forecastCategory: 'pipeline',
          currencyCode: 'EUR',
          valueAmountMinor: suffix === 'home' ? 10000 : 99900,
          createdAt: new Date('2026-10-17T12:00:00Z'),
          expectedCloseAt: new Date(now),
        });
      for (const stage of [1, 2]) {
        await dbAdmin
          .insert(app.crmDealStageHistory)
          .values({
            id: dealId + '-history-' + stage,
            tenantId,
            dealId,
            pipelineId,
            actorId: staffId,
            fromStageId: stage === 1 ? null : pipelineId + '-stage-1',
            toStageId: pipelineId + '-stage-' + stage,
            kind: stage === 1 ? 'created' : 'stage_changed',
            occurredAt: new Date(stage === 1 ? '2026-10-17T12:00:00Z' : '2026-10-18T12:00:00Z'),
          });
      }
    }
  }
  const errors = [];
  const options = {
    now: () => now,
    logger: {
      error: (...args) => {
        errors.push(args);
      },
    },
  };
  const actorFor = suffix => ({
    actorId: `owned-staff-${suffix}`,
    role: 'staff',
    tenantId: suffix === 'home' ? 'tenant_ks' : 'tenant_mk',
    scope: { branchId: null, staffId: `owned-staff-${suffix}` },
  });
  const home = await run({ actor: actorFor('home') }, options);
  const foreign = await run({ actor: actorFor('foreign') }, options);
  for (const [suffix, dashboard, excluded] of [
    ['home', home, 'foreign'],
    ['foreign', foreign, 'home'],
  ]) {
    for (const widget of ['pipelineWorkload', 'funnelMovement', 'stageVelocity']) {
      assert.equal(dashboard[widget].state, 'data', `${suffix}:${widget}`);
    }
    assert.ok(JSON.stringify(dashboard).includes(`owned-staff-${suffix}-pipeline`));
    assert.ok(!JSON.stringify(dashboard).includes(`owned-staff-${excluded}-pipeline`));
  }
  const role = process.env.DB_RLS_ROLE;
  assert.match(role, /^s8_crm_app_[a-f0-9]+$/);
  const columns = await dbAdmin.execute(sql`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='crm_deals' and column_name <> 'value_amount_minor'
    order by ordinal_position`);
  const names = columns
    .map(row => '"' + String(row.column_name).replaceAll('"', '""') + '"')
    .join(',');
  assert.ok(names);
  // Only this disposable fixture role is changed; source queries remain real and unchanged.
  await dbAdmin.execute(
    sql.raw(`REVOKE SELECT ON public.crm_deals FROM "${role}";
    GRANT SELECT (${names}) ON public.crm_deals TO "${role}"`)
  );
  try {
    const [permission] = await dbAdmin.execute(sql`
      select has_column_privilege(${role},'public.crm_deals','value_amount_minor','SELECT') as allowed`);
    assert.equal(permission.allowed, false, 'the intended SQL permission fault is active');
    errors.length = 0;
    const failed = await run({ actor: actorFor('home') }, options);
    assert.equal(failed.pipelineWorkload.state, 'error');
    assert.equal(failed.pipelineWorkload.messageKey, 'error.generic');
    assert.equal(errors.length, 1);
    assert.equal(errors[0][0], '[StaffCrmReporting] pipelineWorkload failed');
    let error = errors[0][1];
    let permissionDenied = false;
    for (let depth = 0; error && depth < 5; depth++, error = error.cause) {
      if (error.code === '42501') permissionDenied = true;
    }
    assert.ok(permissionDenied, 'actual PostgreSQL permission error reached the widget boundary');
    for (const widget of ['funnelMovement', 'stageVelocity']) {
      assert.equal(failed[widget].state, 'data');
      assert.deepEqual(failed[widget], home[widget], `${widget} stays healthy and unchanged`);
    }
    assert.ok(!JSON.stringify(failed).includes('owned-staff-foreign'));
  } finally {
    await dbAdmin.execute(
      sql.raw(`REVOKE SELECT (${names}) ON public.crm_deals FROM "${role}";
      GRANT SELECT ON public.crm_deals TO "${role}"`)
    );
  }
  const recovered = await run({ actor: actorFor('home') }, options);
  assert.deepEqual(
    recovered,
    home,
    'independent later request recovers after fixture fault removal'
  );
  const context = await db.execute(
    sql`select current_setting('app.current_tenant_id',true) as tenant`
  );
  assert.ok(!context[0].tenant, 'tenant context is cleaned');
  await app.assertRlsConnectionRoleReady();
  return [
    'PASS: actual default staff path isolates both tenants.',
    'PASS: actual weighted SELECT permission failure produces only pipelineWorkload error.',
    'PASS: staff funnelMovement and stageVelocity stay data-identical.',
    'PASS: later staff request recovers and tenant context is clean.',
  ];
}
