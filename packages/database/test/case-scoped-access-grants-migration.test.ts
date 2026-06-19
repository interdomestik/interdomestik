import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0085_case_scoped_access_grants.sql', import.meta.url)
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-209 migration creates durable case-scoped grants without profile fields', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE TABLE "case_scoped_access_grants"/u);
  assert.match(sql, /"tenant_id" text NOT NULL/u);
  assert.match(sql, /"access_tenant_id" text NOT NULL/u);
  assert.match(sql, /"case_id" text NOT NULL/u);
  assert.match(sql, /"actor_id" text NOT NULL/u);
  assert.match(sql, /"document_classes" text\[\] NOT NULL/u);
  assert.doesNotMatch(sql, /member_profile|membership|profile_document/u);
});

test('T-209 migration keeps active grants unique and revocable', () => {
  const sql = migrationSql();

  assert.match(sql, /"revoked_at" timestamp with time zone/u);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "case_scoped_access_grants_active_uq"[\s\S]*"revoked_at" IS NULL/u
  );
  assert.match(sql, /CREATE UNIQUE INDEX "case_scoped_access_grants_correlation_uq"/u);
});

test('T-209 migration limits approved document classes and enables two-sided RLS', () => {
  const sql = migrationSql();

  assert.match(sql, /case_scoped_access_grants_document_classes_check/u);
  assert.match(sql, /'correspondence','contract','evidence','legal','receipt'/u);
  assert.doesNotMatch(sql, /'identity'|'medical'|'export'/u);
  assert.match(sql, /ALTER TABLE public\."case_scoped_access_grants" ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /tenant_isolation_case_scoped_access_grants/u);
  assert.match(sql, /access_tenant_id = \(select current_setting/u);
  assert.match(sql, /tenant_id = \(select current_setting/u);
});
