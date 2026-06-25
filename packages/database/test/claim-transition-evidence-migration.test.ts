import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0090_t002b_claim_transition_evidence.sql', import.meta.url)
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-002b migration adds submitted_to_airline as non-lossy status and lifecycle state', () => {
  const sql = migrationSql();

  assert.match(sql, /ADD VALUE IF NOT EXISTS 'submitted_to_airline'/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "claim_recovery_lifecycle_state_check"/u);
  assert.match(sql, /'submitted_to_airline'/u);
});

test('T-002b migration creates tenant-scoped transition evidence without raw narrative fields', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "claim_transition_evidence"/u);
  for (const column of ['tenant_id', 'access_tenant_id', 'claim_id', 'evidence_type']) {
    assert.match(sql, new RegExp(`"${column}"`, 'u'));
  }
  assert.match(sql, /claim_transition_evidence_claim_type_uq/u);
  assert.match(sql, /WHERE "evidence_status" <> 'revoked'/u);
  assert.doesNotMatch(sql, /medical_narrative|claim_narrative|document_body|raw_text/u);
});

test('T-002b migration applies access-tenant read and home-tenant write RLS', () => {
  const sql = migrationSql();

  assert.match(sql, /ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /tenant_isolation_claim_transition_evidence/u);
  assert.match(sql, /coalesce\(access_tenant_id, tenant_id\)/u);
  assert.match(sql, /tenant_write_claim_transition_evidence/u);
  assert.match(
    sql,
    /write_expr constant text :=\s*'tenant_id = \(select current_setting\(''app\.current_access_tenant_id'', true\)\)::text';/u
  );
  assert.match(sql, /CREATE POLICY %I ON public\.%I FOR UPDATE USING \(%s\) WITH CHECK \(%s\)/u);
});
