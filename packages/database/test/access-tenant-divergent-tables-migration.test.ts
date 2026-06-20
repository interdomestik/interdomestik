import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0086_access_tenant_divergent_tables.sql', import.meta.url)
);

const DIVERGENT_TABLES = [
  'claim',
  'claim_documents',
  'claim_escalation_agreements',
  'claim_recovery_no_fee_evidence',
  'domain_events',
] as const;

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-305b migration covers only approved divergent tenant tables', () => {
  const sql = migrationSql();

  for (const tableName of DIVERGENT_TABLES) {
    assert.match(sql, new RegExp(`'${tableName}'`, 'u'));
  }

  assert.doesNotMatch(sql, /membership|subscriptions|crm_|tenant_settings|claim_threads/u);
});

test('T-305b migration adds and backfills access_tenant_id idempotently', () => {
  const sql = migrationSql();

  assert.match(sql, /ADD COLUMN IF NOT EXISTS access_tenant_id text/u);
  assert.match(sql, /SET access_tenant_id = tenant_id WHERE access_tenant_id IS NULL/u);
  assert.match(
    sql,
    /ADD CONSTRAINT %I FOREIGN KEY \(access_tenant_id\) REFERENCES public\.tenants/u
  );
  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS %I ON public\.%I USING btree \(access_tenant_id\)/u
  );
});

test('T-305b migration applies access-tenant SELECT and tenant-pinned writes', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE POLICY %I ON public\.%I FOR SELECT USING \(%s\)/u);
  assert.match(sql, /coalesce\(access_tenant_id, tenant_id\) = \(select current_setting/u);
  assert.match(sql, /CREATE POLICY %I ON public\.%I FOR INSERT WITH CHECK \(%s\)/u);
  assert.match(sql, /CREATE POLICY %I ON public\.%I FOR UPDATE USING \(%s\) WITH CHECK \(%s\)/u);
  assert.match(sql, /CREATE POLICY %I ON public\.%I FOR DELETE USING \(%s\)/u);
  assert.match(sql, /coalesce\(access_tenant_id, tenant_id\) = tenant_id/u);
  assert.doesNotMatch(sql, /app\.current_tenant_id/u);
});
