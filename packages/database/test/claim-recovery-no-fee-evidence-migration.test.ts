import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0084_claim_recovery_no_fee_evidence.sql', import.meta.url)
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-203 no-fee migration creates narrow tenant-scoped evidence table', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE TABLE "claim_recovery_no_fee_evidence"/u);
  assert.match(sql, /"tenant_id" text NOT NULL/u);
  assert.match(sql, /"claim_id" text NOT NULL/u);
  assert.match(sql, /"reason_code" text NOT NULL/u);
  assert.match(sql, /"documented_by_id" text NOT NULL/u);
  assert.match(sql, /"documented_at" timestamp with time zone DEFAULT now\(\) NOT NULL/u);
  assert.match(
    sql,
    /CHECK \("reason_code" in \('no_recovery', 'not_billable_under_recovery_scope'\)\)/u
  );
});

test('T-203 no-fee migration keeps evidence unique per tenant and claim', () => {
  const sql = migrationSql();

  assert.match(sql, /FOREIGN KEY \("tenant_id"\) REFERENCES "public"\."tenants"\("id"\)/u);
  assert.match(sql, /FOREIGN KEY \("claim_id"\) REFERENCES "public"\."claim"\("id"\)/u);
  assert.match(sql, /FOREIGN KEY \("documented_by_id"\) REFERENCES "public"\."user"\("id"\)/u);
  assert.match(
    sql,
    /CREATE UNIQUE INDEX "claim_recovery_no_fee_evidence_claim_uq"[\s\S]*\("tenant_id","claim_id"\)/u
  );
});

test('T-203 no-fee migration enables access-tenant RLS', () => {
  const sql = migrationSql();

  assert.match(
    sql,
    /ALTER TABLE public\."claim_recovery_no_fee_evidence" ENABLE ROW LEVEL SECURITY/u
  );
  assert.match(sql, /tenant_isolation_claim_recovery_no_fee_evidence/u);
  assert.match(sql, /app\.current_access_tenant_id/u);
  assert.match(sql, /tenant_id = \(select current_setting/u);
  assert.doesNotMatch(sql, /app\.current_tenant_id/u);
});
