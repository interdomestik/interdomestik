import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0083_access_tenant_rls_policies.sql', import.meta.url)
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-302d migration uses access-tenant GUC for tenant-isolation policies', () => {
  const sql = migrationSql();

  assert.match(sql, /access_tenant_setting constant text := 'app\.current_access_tenant_id'/u);
  assert.match(sql, /current_setting\(%L, true\)/u);
  assert.match(sql, /coalesce\(access_tenant_id, tenant_id\)/u);
  assert.match(sql, /c\.table_name = 'domain_events'/u);
  assert.doesNotMatch(sql, /app\.current_tenant_id/u);
});

test('T-302d migration preserves policy names and initPlan predicate shape', () => {
  const sql = migrationSql();

  assert.match(sql, /p\.policyname = format\('tenant_isolation_%s', p\.tablename\)/u);
  assert.match(sql, /p\.tablename <> 'domain_events'/u);
  assert.match(sql, /ALTER POLICY "tenant_isolation_domain_events"/u);
  assert.match(sql, /target\.cmd = 'INSERT'/u);
  assert.match(sql, /ALTER POLICY %I ON public\.%I USING \(%s\)'/u);
  assert.match(sql, /ALTER POLICY %I ON public\.%I USING \(%s\) WITH CHECK \(%s\)'/u);
  assert.match(sql, /target\.cmd IN \('SELECT', 'DELETE'\)/u);
  assert.match(sql, /information_schema\.columns c/u);
});

test('T-302d migration keeps domain_events RLS enabled and access-scoped', () => {
  const sql = migrationSql();

  assert.match(sql, /ALTER TABLE public\."domain_events" ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /policyname = 'tenant_isolation_domain_events'/u);
  assert.match(sql, /CREATE POLICY "tenant_isolation_domain_events"/u);
  assert.match(sql, /domain_events_expr/u);
});
