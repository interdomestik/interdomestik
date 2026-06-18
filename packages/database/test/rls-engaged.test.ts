import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { claims, crmTaskHistory, crmTasks, domainEvents, user } from '../src/schema';
import {
  applyRlsTestConnectionEnv,
  grantRlsTestRole,
  quoteIdentifier,
  quoteSqlLiteral,
  requireRlsPreconditions,
  resolveRlsTestConnectionConfig,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';
import { assertRlsWriteBoundaries } from './rls-write-boundary-proof';

const KS_TENANT_ID = 'tenant_ks';
const MK_TENANT_ID = 'tenant_mk';
const REQUIRED_RLS_TABLES = ['claim', 'crm_tasks', 'crm_task_history', 'domain_events'] as const;

type RlsRuntimeReceipt = {
  currentUser: string;
  currentAccessTenantId: string | null;
  currentTenantId: string | null;
  rowSecurity: string;
};

type DbModule = typeof import('../src/db');
type TenantModule = typeof import('../src/tenant');

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

test('resolveRlsTestConnectionConfig keeps pooler URLs on the admin connection and uses SET ROLE', () => {
  const config = resolveRlsTestConnectionConfig(
    'postgresql://postgres.project-ref:secret@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
  );

  assert.equal(config.databaseUrlRls, null);
  assert.equal(config.dbRlsRole, TEST_DB_ROLE);
});

test('resolveRlsTestConnectionConfig uses a dedicated low-privilege connection for direct Postgres URLs', () => {
  const config = resolveRlsTestConnectionConfig(
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  );

  assert.ok(config.databaseUrlRls);
  const rlsUrl = new URL(config.databaseUrlRls);
  assert.equal(rlsUrl.protocol, 'postgresql:');
  assert.equal(rlsUrl.username, TEST_DB_ROLE);
  assert.equal(rlsUrl.password, TEST_DB_PASSWORD);
  assert.equal(rlsUrl.hostname, '127.0.0.1');
  assert.equal(rlsUrl.port, '54322');
  assert.equal(rlsUrl.pathname, '/postgres');
  assert.equal(config.dbRlsRole, null);
});

test('RLS is actively enforced across tenant context boundaries', async t => {
  const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';

  if (!process.env.DATABASE_URL) {
    if (requireIntegration) {
      assert.fail('RLS test requires DATABASE_URL when REQUIRE_RLS_INTEGRATION=1.');
    }
    t.skip('DATABASE_URL is required for RLS integration test');
    return;
  }

  const adminSql = postgres(process.env.DATABASE_URL);
  const adminDb = drizzle(adminSql);

  await requireRlsPreconditions(adminDb, adminSql, requireIntegration, t, REQUIRED_RLS_TABLES);
  if (t.signal.aborted) {
    return;
  }

  // Ensure a dedicated low-privilege role is available for RLS verification.
  await adminDb.execute(
    sql.raw(`
      do $$
      begin
        create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)};
      exception
        when duplicate_object then
          alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)};
      end
      $$;
    `)
  );
  await grantRlsTestRole(adminDb, REQUIRED_RLS_TABLES);
  await adminDb.execute(
    sql.raw(`grant insert on table "claim" to ${quoteIdentifier(TEST_DB_ROLE)}`)
  );
  await adminDb.execute(
    sql.raw(`grant insert on table "domain_events" to ${quoteIdentifier(TEST_DB_ROLE)}`)
  );

  const ksUserId = uniqueId('rls_user_ks');
  const mkUserId = uniqueId('rls_user_mk');
  const claimId = uniqueId('rls_claim_ks');
  const taskId = uniqueId('rls_task_ks');
  const historyId = uniqueId('rls_task_history_ks');
  const eventId = uniqueId('rls_event_ks');
  const mkEventId = uniqueId('rls_event_mk');
  const rlsEventId = uniqueId('rls_event_insert_ks');
  const rejectedClaimId = uniqueId('rls_claim_rejected_mk');
  const rejectedEventId = uniqueId('rls_event_rejected_mk');
  const now = new Date();
  let rlsTestEnv: ReturnType<typeof applyRlsTestConnectionEnv> | null = null;
  let dbAdmin: DbModule['dbAdmin'] | null = null;
  let dbRls: DbModule['dbRls'] | null = null;
  let withTenantContext: TenantModule['withTenantContext'] | null = null;

  try {
    rlsTestEnv = applyRlsTestConnectionEnv(process.env.DATABASE_URL);
    [{ dbAdmin, dbRls }, { withTenantContext }] = await Promise.all([
      import('../src/db'),
      import('../src/tenant'),
    ]);
    console.log('RLS_INTEGRATION_RAN=1');

    await dbAdmin.insert(user).values([
      {
        id: ksUserId,
        tenantId: KS_TENANT_ID,
        name: 'RLS Test KS User',
        email: `${ksUserId}@example.test`,
        emailVerified: true,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: mkUserId,
        tenantId: MK_TENANT_ID,
        name: 'RLS Test MK User',
        email: `${mkUserId}@example.test`,
        emailVerified: true,
        role: 'member',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await dbAdmin.insert(claims).values({
      id: claimId,
      tenantId: KS_TENANT_ID,
      userId: ksUserId,
      title: 'RLS isolation proof',
      description: 'cross-tenant row must not leak',
      category: 'retail',
      companyName: 'RLS Test Co',
      status: 'draft',
      origin: 'portal',
    });

    await dbAdmin.insert(crmTasks).values({
      assignedActorId: ksUserId,
      assignedBranchId: null,
      assignedKind: 'actor',
      assignedRole: 'agent',
      assignedTeamId: null,
      assignedTenantId: KS_TENANT_ID,
      branchId: null,
      createReasonCode: 'manual',
      createdAt: now,
      createdById: ksUserId,
      createdByRole: 'admin',
      dueAt: null,
      id: taskId,
      idempotencyKey: null,
      priority: 'normal',
      status: 'pending',
      subjectId: 'rls-subject',
      subjectKind: 'lead',
      tenantId: KS_TENANT_ID,
      updatedAt: now,
    });

    await dbAdmin.insert(crmTaskHistory).values({
      actorId: ksUserId,
      actorRole: 'admin',
      event: 'created',
      fromStatus: null,
      id: historyId,
      occurredAt: now,
      reasonCode: 'manual',
      taskId,
      tenantId: KS_TENANT_ID,
      toStatus: 'pending',
    });

    await dbAdmin.insert(domainEvents).values({
      actorId: ksUserId,
      actorRole: 'admin',
      aggregateVersion: 1,
      correlationId: uniqueId('rls_correlation'),
      entityId: claimId,
      entityType: 'claim',
      eventName: 'claim.rls_tested',
      eventVersion: 1,
      id: eventId,
      payload: {},
      tenantId: KS_TENANT_ID,
    });

    await dbAdmin.insert(domainEvents).values({
      actorId: mkUserId,
      actorRole: 'admin',
      aggregateVersion: 1,
      correlationId: uniqueId('rls_correlation'),
      entityId: mkUserId,
      entityType: 'user',
      eventName: 'user.rls_tested',
      eventVersion: 1,
      id: mkEventId,
      payload: {},
      tenantId: MK_TENANT_ID,
    });

    const [mkRlsReceipt] = await withTenantContext(
      { tenantId: MK_TENANT_ID, accessTenantId: '  ' },
      async tx => {
        return tx.execute<RlsRuntimeReceipt>(sql`
          select
            current_user as "currentUser",
            current_setting('app.current_access_tenant_id', true) as "currentAccessTenantId",
            current_setting('app.current_tenant_id', true) as "currentTenantId",
            current_setting('row_security') as "rowSecurity"
        `);
      }
    );

    assert.deepEqual(
      {
        currentAccessTenantId: mkRlsReceipt?.currentAccessTenantId,
        currentTenantId: mkRlsReceipt?.currentTenantId,
        currentUser: mkRlsReceipt?.currentUser,
        rowSecurity: mkRlsReceipt?.rowSecurity,
      },
      {
        currentAccessTenantId: MK_TENANT_ID,
        currentTenantId: MK_TENANT_ID,
        currentUser: TEST_DB_ROLE,
        rowSecurity: 'on',
      }
    );

    const mkRows = await withTenantContext({ tenantId: MK_TENANT_ID }, async tx => {
      return tx
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, KS_TENANT_ID)));
    });

    assert.equal(mkRows.length, 0, 'tenant_mk must not see tenant_ks claim row');

    const blankAccessEventRows = await withTenantContext(
      { tenantId: MK_TENANT_ID, accessTenantId: '  ' },
      async tx => {
        return tx
          .select({ id: domainEvents.id })
          .from(domainEvents)
          .where(and(eq(domainEvents.id, eventId), eq(domainEvents.tenantId, KS_TENANT_ID)));
      }
    );
    assert.equal(
      blankAccessEventRows.length,
      0,
      'blank access_tenant fallback to tenant_mk must not see tenant_ks domain event'
    );

    const blankAccessOwnEventRows = await withTenantContext(
      { tenantId: MK_TENANT_ID, accessTenantId: '  ' },
      async tx => {
        return tx
          .select({ id: domainEvents.id })
          .from(domainEvents)
          .where(and(eq(domainEvents.id, mkEventId), eq(domainEvents.tenantId, MK_TENANT_ID)));
      }
    );
    assert.equal(
      blankAccessOwnEventRows.length,
      1,
      'blank access_tenant fallback to tenant_mk must see tenant_mk domain event'
    );

    const accessKsClaimRows = await withTenantContext(
      { tenantId: MK_TENANT_ID, accessTenantId: KS_TENANT_ID },
      async tx => {
        return tx
          .select({ id: claims.id })
          .from(claims)
          .where(and(eq(claims.id, claimId), eq(claims.tenantId, KS_TENANT_ID)));
      }
    );
    assert.equal(
      accessKsClaimRows.length,
      1,
      'access_tenant tenant_ks must see tenant_ks claim even when current_tenant is tenant_mk'
    );

    const accessKsEventRows = await withTenantContext(
      { tenantId: MK_TENANT_ID, accessTenantId: KS_TENANT_ID },
      async tx => {
        return tx
          .select({ id: domainEvents.id })
          .from(domainEvents)
          .where(and(eq(domainEvents.id, eventId), eq(domainEvents.tenantId, KS_TENANT_ID)));
      }
    );
    assert.equal(
      accessKsEventRows.length,
      1,
      'access_tenant tenant_ks must see tenant_ks domain event under access-GUC RLS'
    );

    const tenantKsAccessMkRows = await withTenantContext(
      { tenantId: KS_TENANT_ID, accessTenantId: MK_TENANT_ID },
      async tx => {
        return tx
          .select({ id: domainEvents.id })
          .from(domainEvents)
          .where(and(eq(domainEvents.id, eventId), eq(domainEvents.tenantId, KS_TENANT_ID)));
      }
    );
    assert.equal(
      tenantKsAccessMkRows.length,
      0,
      'access_tenant tenant_mk must not see tenant_ks domain event even when current_tenant is tenant_ks'
    );

    await assertRlsWriteBoundaries({
      claimId,
      ksTenantId: KS_TENANT_ID,
      ksUserId,
      mkTenantId: MK_TENANT_ID,
      mkUserId,
      rejectedClaimId,
      rejectedEventId,
      rlsEventId,
      uniqueId,
      withTenantContext,
    });

    const unsetTaskRows = await dbRls
      .select({ id: crmTasks.id })
      .from(crmTasks)
      .where(and(eq(crmTasks.id, taskId), eq(crmTasks.tenantId, KS_TENANT_ID)));
    assert.equal(unsetTaskRows.length, 0, 'crm_tasks must return zero rows with tenant GUC unset');

    const unsetHistoryRows = await dbRls
      .select({ id: crmTaskHistory.id })
      .from(crmTaskHistory)
      .where(and(eq(crmTaskHistory.id, historyId), eq(crmTaskHistory.tenantId, KS_TENANT_ID)));
    assert.equal(
      unsetHistoryRows.length,
      0,
      'crm_task_history must return zero rows with tenant GUC unset'
    );

    const ksRows = await withTenantContext({ tenantId: KS_TENANT_ID }, async tx => {
      return tx
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, KS_TENANT_ID)));
    });

    assert.equal(ksRows.length, 1, 'tenant_ks must see its own claim row');

    const ksTaskRows = await withTenantContext({ tenantId: KS_TENANT_ID }, async tx => {
      return tx
        .select({ id: crmTasks.id })
        .from(crmTasks)
        .where(and(eq(crmTasks.id, taskId), eq(crmTasks.tenantId, KS_TENANT_ID)));
    });

    assert.equal(ksTaskRows.length, 1, 'tenant_ks must see its own CRM task row');
  } finally {
    if (dbAdmin) {
      await dbAdmin
        .delete(domainEvents)
        .where(inArray(domainEvents.id, [eventId, mkEventId, rlsEventId]));
      await dbAdmin.delete(crmTaskHistory).where(eq(crmTaskHistory.id, historyId));
      await dbAdmin.delete(crmTasks).where(eq(crmTasks.id, taskId));
      await dbAdmin.delete(claims).where(eq(claims.id, claimId));
      await dbAdmin.delete(user).where(inArray(user.id, [ksUserId, mkUserId]));
    }
    rlsTestEnv?.restore();
    await adminSql.end({ timeout: 5 });
  }
});
