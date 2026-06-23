import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0088_tenant_entity_decomposition.sql', import.meta.url)
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-504 migration creates the three additive entity decomposition tables', () => {
  const sql = migrationSql();

  for (const tableName of ['legal_entities', 'marketing_hosts', 'default_booking_links']) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\."${tableName}"`, 'u'));
    assert.match(sql, new RegExp(`\\('${tableName}'\\)`, 'u'));
  }

  assert.match(sql, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/u);
  assert.match(sql, /CREATE POLICY %I ON public\.%I USING \(%s\) WITH CHECK \(%s\)/u);
  assert.match(sql, /FOREIGN KEY \("tenant_id"\) REFERENCES public\."tenants"\("id"\)/u);
  assert.match(
    sql,
    /"legal_entities_country_code_check" CHECK \("country_code" ~ '\^\[A-Z\]\{2\}\$'\)/u
  );
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "marketing_hosts_host_uq"/u);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "default_booking_links_tenant_uq"/u);
});

test('T-504 migration backfills idempotently from tenants without destructive cutover', () => {
  const sql = migrationSql();

  assert.match(sql, /INSERT INTO public\."legal_entities"/u);
  assert.match(sql, /FROM public\."tenants" t/u);
  assert.match(sql, /ON CONFLICT \("id"\) DO UPDATE/u);
  assert.match(sql, /tenant_host_candidates AS/u);
  assert.match(sql, /count\(\*\) OVER \(PARTITION BY base_host_label\)/u);
  assert.match(
    sql,
    /ALTER TABLE public\."subscriptions"\s+ADD COLUMN IF NOT EXISTS "legal_entity_id" text/u
  );
  assert.match(sql, /coalesce\(legal_le\."id", home_le\."id"\) AS legal_entity_id/u);
  assert.match(sql, /subscriptions_legal_entity_id_fk/u);
  assert.doesNotMatch(sql, /DROP\s+TABLE\s+public\."tenants"/iu);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+public\."tenants"\s+DROP/iu);
  assert.doesNotMatch(sql, /terms[_ ]?re[- ]?issue|acceptance[_ ]?recapture|active[_-]case/iu);
});

test('T-504 migration adds compatibility view, aggregate proof, and repair posture', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE OR REPLACE VIEW public\."tenant_entity_boundaries"/u);
  assert.match(sql, /LEFT JOIN public\."legal_entities" le ON le\."id" = dbl\."legal_entity_id"/u);
  assert.match(
    sql,
    /WHERE t\."id" = \(select current_setting\('app\.current_tenant_id', true\)\)::text/u
  );
  assert.match(
    sql,
    /ALTER VIEW public\."tenant_entity_boundaries"\s+SET \(security_invoker = true\)/u
  );
  assert.match(sql, /Rollback\/data-repair plan:/u);
  assert.match(sql, /T-504 unresolved references legal=%/u);
  assert.match(sql, /unmapped_subscriptions=%/u);
  assert.match(sql, /T-504 entity decomposition backfill legal_entities=%/u);
});
