import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';

export const TEST_DB_ROLE = 'interdomestik_rls_test';
export const TEST_DB_PASSWORD = process.env.RLS_TEST_DB_PASSWORD ?? randomUUID();
export type RlsTestConnectionConfig = { databaseUrlRls: string | null; dbRlsRole: string | null };

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export const quoteSqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

function isPoolerConnection(databaseUrl: string): boolean {
  return /\.pooler\.supabase\.com$/iu.test(new URL(databaseUrl).hostname);
}

function buildRlsDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = TEST_DB_ROLE;
  url.password = TEST_DB_PASSWORD;
  return url.toString();
}

export function resolveRlsTestConnectionConfig(databaseUrl: string): RlsTestConnectionConfig {
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

export function applyRlsTestConnectionEnv(databaseUrl: string): { restore(): void } {
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

export async function requireRlsPreconditions(
  adminDb: ReturnType<typeof drizzle>,
  adminSql: postgres.Sql,
  requireIntegration: boolean,
  t: TestContext,
  requiredTables: readonly string[]
): Promise<void> {
  const tableList = sql.join(
    requiredTables.map(tableName => sql`${tableName}`),
    sql`, `
  );
  const tableRows = await adminDb.execute<{ relname: string; relrowsecurity: boolean }>(sql`
    select c.relname, c.relrowsecurity
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname in (${tableList})
  `);
  const enabledTables = new Map(tableRows.map(row => [row.relname, row.relrowsecurity]));
  const missingOrDisabled = requiredTables.filter(table => enabledTables.get(table) !== true);
  if (missingOrDisabled.length > 0) {
    await adminSql.end({ timeout: 5 });
    if (requireIntegration) {
      assert.fail(
        `RLS test requires tables with RLS enabled when REQUIRE_RLS_INTEGRATION=1: ${missingOrDisabled.join(', ')}`
      );
    }
    t.skip(`RLS tables are not ready: ${missingOrDisabled.join(', ')}`);
    return;
  }

  const policies = await adminDb.execute<{ tablename: string; policyname: string }>(sql`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname = ('tenant_isolation_' || tablename)
      and tablename in (${tableList})
  `);
  const policyTables = new Set(policies.map(row => row.tablename));
  const missingPolicyTables = requiredTables.filter(table => !policyTables.has(table));

  if (missingPolicyTables.length > 0) {
    await adminSql.end({ timeout: 5 });
    if (requireIntegration) {
      assert.fail(
        `RLS test requires tenant-isolation policies when REQUIRE_RLS_INTEGRATION=1: ${missingPolicyTables.join(', ')}`
      );
    }
    t.skip(`tenant-isolation policies are not present: ${missingPolicyTables.join(', ')}`);
  }
}
