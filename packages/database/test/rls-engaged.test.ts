import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { TestContext } from 'node:test';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { claims, crmTaskHistory, crmTasks, user } from '../src/schema';

const KS_TENANT_ID = 'tenant_ks';
const MK_TENANT_ID = 'tenant_mk';
const TEST_DB_ROLE = 'interdomestik_rls_test';
const TEST_DB_PASSWORD = 'interdomestik_rls_test_password';

type RlsTestConnectionConfig = {
  databaseUrlRls: string | null;
  dbRlsRole: string | null;
};

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

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function isPoolerConnection(databaseUrl: string): boolean {
  return /\.pooler\.supabase\.com$/iu.test(new URL(databaseUrl).hostname);
}

function buildRlsDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = TEST_DB_ROLE;
  url.password = TEST_DB_PASSWORD;
  return url.toString();
}

function resolveRlsTestConnectionConfig(databaseUrl: string): RlsTestConnectionConfig {
  if (isPoolerConnection(databaseUrl)) {
    return {
      databaseUrlRls: null,
      dbRlsRole: TEST_DB_ROLE,
    };
  }

  return {
    databaseUrlRls: buildRlsDatabaseUrl(databaseUrl),
    dbRlsRole: null,
  };
}

async function requireRlsPreconditions(
  adminDb: ReturnType<typeof drizzle>,
  adminSql: postgres.Sql,
  requireIntegration: boolean,
  t: TestContext
): Promise<void> {
  const requiredTables = ['claim', 'crm_tasks', 'crm_task_history'] as const;
  const [rlsEnabled] = await adminDb.execute<{ enabled: boolean }>(
    sql`select relrowsecurity as enabled from pg_class where relname = 'claim'`
  );
  if (!rlsEnabled?.enabled) {
    await adminSql.end({ timeout: 5 });
    if (requireIntegration) {
      assert.fail(
        'RLS test requires claim table RLS enabled when REQUIRE_RLS_INTEGRATION=1 (migrations must be applied).'
      );
    }
    t.skip('claim table RLS is not enabled in current database');
    return;
  }

  const tableRows = await adminDb.execute<{ relname: string; relrowsecurity: boolean }>(sql`
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in ('claim', 'crm_tasks', 'crm_task_history')
  `);
  const enabledTables = new Map(tableRows.map(row => [row.relname, row.relrowsecurity]));
  const missingOrDisabled = requiredTables.filter(table => enabledTables.get(table) !== true);
  if (missingOrDisabled.length > 0) {
    await adminSql.end({ timeout: 5 });
    if (requireIntegration) {
      assert.fail(
        `RLS test requires CRM task tables with RLS enabled when REQUIRE_RLS_INTEGRATION=1: ${missingOrDisabled.join(', ')}`
      );
    }
    t.skip(`CRM task RLS tables are not ready: ${missingOrDisabled.join(', ')}`);
    return;
  }

  const policies = await adminDb.execute<{ policyname: string }>(
    sql`
      select policyname
      from pg_policies
      where schemaname = 'public'
        and (
          (tablename = 'claim' and policyname = 'tenant_isolation_claim')
          or (tablename = 'crm_tasks' and policyname = 'tenant_isolation_crm_tasks')
          or (tablename = 'crm_task_history' and policyname = 'tenant_isolation_crm_task_history')
        )
    `
  );
  if (policies.length !== requiredTables.length) {
    await adminSql.end({ timeout: 5 });
    if (requireIntegration) {
      assert.fail(
        'RLS test requires tenant-isolation policies for claim, crm_tasks, and crm_task_history when REQUIRE_RLS_INTEGRATION=1.'
      );
    }
    t.skip('tenant-isolation policy set for claim/crm task tables is not present');
    return;
  }
}

function applyRlsTestConnectionEnv(databaseUrl: string): {
  restore(): void;
} {
  const previousDatabaseUrlRls = process.env.DATABASE_URL_RLS;
  const previousDbRlsRole = process.env.DB_RLS_ROLE;
  const connectionConfig = resolveRlsTestConnectionConfig(databaseUrl);

  if (connectionConfig.databaseUrlRls) {
    process.env.DATABASE_URL_RLS = connectionConfig.databaseUrlRls;
  } else {
    delete process.env.DATABASE_URL_RLS;
  }

  if (connectionConfig.dbRlsRole) {
    process.env.DB_RLS_ROLE = connectionConfig.dbRlsRole;
  } else {
    delete process.env.DB_RLS_ROLE;
  }

  delete (globalThis as { queryClientAdmin?: unknown; queryClientRls?: unknown }).queryClientAdmin;
  delete (globalThis as { queryClientAdmin?: unknown; queryClientRls?: unknown }).queryClientRls;

  return {
    restore() {
      if (previousDatabaseUrlRls) {
        process.env.DATABASE_URL_RLS = previousDatabaseUrlRls;
      } else {
        delete process.env.DATABASE_URL_RLS;
      }

      if (previousDbRlsRole) {
        process.env.DB_RLS_ROLE = previousDbRlsRole;
      } else {
        delete process.env.DB_RLS_ROLE;
      }
    },
  };
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

  assert.equal(
    config.databaseUrlRls,
    'postgresql://interdomestik_rls_test:interdomestik_rls_test_password@127.0.0.1:54322/postgres'
  );
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

  await requireRlsPreconditions(adminDb, adminSql, requireIntegration, t);
  if (t.signal.aborted) {
    return;
  }

  // Ensure a dedicated low-privilege role is available for RLS verification.
  await adminDb.execute(
    sql.raw(`
      do $$
      begin
        create role "${TEST_DB_ROLE}" login password '${TEST_DB_PASSWORD}';
      exception
        when duplicate_object then
          alter role "${TEST_DB_ROLE}" with login password '${TEST_DB_PASSWORD}';
      end
      $$;
    `)
  );
  await adminDb.execute(sql.raw(`grant usage on schema public to "${TEST_DB_ROLE}"`));
  await adminDb.execute(sql.raw(`grant select on table "claim" to "${TEST_DB_ROLE}"`));
  await adminDb.execute(sql.raw(`grant select on table "crm_tasks" to "${TEST_DB_ROLE}"`));
  await adminDb.execute(sql.raw(`grant select on table "crm_task_history" to "${TEST_DB_ROLE}"`));
  const [{ currentUser }] = await adminDb.execute<{ currentUser: string }>(
    sql`select current_user as "currentUser"`
  );
  await adminDb.execute(sql.raw(`grant "${TEST_DB_ROLE}" to ${quoteIdentifier(currentUser)}`));

  const ksUserId = uniqueId('rls_user_ks');
  const mkUserId = uniqueId('rls_user_mk');
  const claimId = uniqueId('rls_claim_ks');
  const taskId = uniqueId('rls_task_ks');
  const historyId = uniqueId('rls_task_history_ks');
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

    const [mkRlsReceipt] = await withTenantContext({ tenantId: MK_TENANT_ID }, async tx => {
      return tx.execute<RlsRuntimeReceipt>(sql`
        select
          current_user as "currentUser",
          current_setting('app.current_access_tenant_id', true) as "currentAccessTenantId",
          current_setting('app.current_tenant_id', true) as "currentTenantId",
          current_setting('row_security') as "rowSecurity"
      `);
    });

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
      },
      'RLS verification must set role, tenant GUCs, and row_security inside the tenant transaction'
    );

    const mkRows = await withTenantContext({ tenantId: MK_TENANT_ID }, async tx => {
      return tx
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, KS_TENANT_ID)));
    });

    assert.equal(mkRows.length, 0, 'tenant_mk must not see tenant_ks claim row');

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
      await dbAdmin.delete(crmTaskHistory).where(eq(crmTaskHistory.id, historyId));
      await dbAdmin.delete(crmTasks).where(eq(crmTasks.id, taskId));
      await dbAdmin.delete(claims).where(eq(claims.id, claimId));
      await dbAdmin.delete(user).where(inArray(user.id, [ksUserId, mkUserId]));
    }
    rlsTestEnv?.restore();
    await adminSql.end({ timeout: 5 });
  }
});
