import assert from 'node:assert/strict';
import test from 'node:test';

import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { claims, user } from '../src/schema';

const KS_TENANT_ID = 'tenant_ks';
const MK_TENANT_ID = 'tenant_mk';
const TEST_DB_ROLE = 'interdomestik_rls_test';
const TEST_DB_PASSWORD = 'interdomestik_rls_test_password';

type RlsTestConnectionConfig = {
  databaseUrlRls: string | null;
  dbRlsRole: string | null;
};

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function assertRoleIdentifier(role: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(role)) {
    throw new Error(`Invalid role identifier: ${role}`);
  }
  return role;
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

  const policies = await adminDb.execute<{ policyname: string }>(
    sql`select policyname from pg_policies where schemaname = 'public' and tablename = 'claim' and policyname = 'tenant_isolation_claim'`
  );
  if (policies.length === 0) {
    await adminSql.end({ timeout: 5 });
    if (requireIntegration) {
      assert.fail(
        'RLS test requires tenant_isolation_claim policy when REQUIRE_RLS_INTEGRATION=1.'
      );
    }
    t.skip('tenant_isolation_claim policy is not present in current database');
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
  const [{ currentUser }] = await adminDb.execute<{ currentUser: string }>(
    sql`select current_user as "currentUser"`
  );
  await adminDb.execute(
    sql.raw(`grant "${TEST_DB_ROLE}" to "${assertRoleIdentifier(currentUser)}"`)
  );

  const previousDatabaseUrlRls = process.env.DATABASE_URL_RLS;
  const previousDbRlsRole = process.env.DB_RLS_ROLE;
  const connectionConfig = resolveRlsTestConnectionConfig(process.env.DATABASE_URL);
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

  delete (global as { queryClientAdmin?: unknown; queryClientRls?: unknown }).queryClientAdmin;
  delete (global as { queryClientAdmin?: unknown; queryClientRls?: unknown }).queryClientRls;

  const [{ dbAdmin }, { withTenantContext }] = await Promise.all([
    import('../src/db'),
    import('../src/tenant'),
  ]);
  console.log('RLS_INTEGRATION_RAN=1');

  const ksUserId = uniqueId('rls_user_ks');
  const mkUserId = uniqueId('rls_user_mk');
  const claimId = uniqueId('rls_claim_ks');
  const now = new Date();

  try {
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

    const mkRows = await withTenantContext({ tenantId: MK_TENANT_ID }, async tx => {
      return tx
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, KS_TENANT_ID)));
    });

    assert.equal(mkRows.length, 0, 'tenant_mk must not see tenant_ks claim row');

    const ksRows = await withTenantContext({ tenantId: KS_TENANT_ID }, async tx => {
      return tx
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.id, claimId), eq(claims.tenantId, KS_TENANT_ID)));
    });

    assert.equal(ksRows.length, 1, 'tenant_ks must see its own claim row');
  } finally {
    await dbAdmin.delete(claims).where(eq(claims.id, claimId));
    await dbAdmin.delete(user).where(eq(user.id, ksUserId));
    await dbAdmin.delete(user).where(eq(user.id, mkUserId));
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
    await adminSql.end({ timeout: 5 });
  }
});
