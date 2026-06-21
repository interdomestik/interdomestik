import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const MIGRATION_PATH = fileURLToPath(
  new URL('../drizzle/0087_claim_document_ai_extraction_consents.sql', import.meta.url)
);

function migrationSql(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

test('T-404a migration creates scoped AI document extraction consent table', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS "claim_document_ai_extraction_consents"/u);
  assert.match(sql, /"tenant_id" text NOT NULL/u);
  assert.match(sql, /"subject_id" text NOT NULL/u);
  assert.match(sql, /"actor_id" text NOT NULL/u);
  assert.match(sql, /"claim_id" text NOT NULL/u);
  assert.match(sql, /"document_id" text NOT NULL/u);
  assert.match(sql, /"privacy_version" text NOT NULL/u);
  assert.match(sql, /"source_surface" text NOT NULL/u);
  assert.doesNotMatch(sql, /DEFAULT 'ai_document_extraction'/u);
  assert.match(sql, /CHECK \("consent_type" = 'ai_document_extraction'\)/u);
  assert.match(sql, /CHECK \("processing_purpose" = 'ai_document_extraction'\)/u);
  assert.match(sql, /CHECK \("status" IN \('accepted', 'withdrawn'\)\)/u);
});

test('T-404a migration indexes the exact consent resolver scope', () => {
  const sql = migrationSql();

  assert.match(sql, /CREATE INDEX IF NOT EXISTS "idx_claim_doc_ai_consents_scope"/u);
  assert.match(
    sql,
    /USING btree \("tenant_id","subject_id","claim_id","document_id","processing_purpose","recorded_at"\)/u
  );
});

test('T-404a migration enables tenant-scoped RLS for AI consent rows', () => {
  const sql = migrationSql();

  assert.match(
    sql,
    /ALTER TABLE public\."claim_document_ai_extraction_consents" ENABLE ROW LEVEL SECURITY/u
  );
  assert.match(sql, /policyname = 'tenant_isolation_claim_document_ai_extraction_consents'/u);
  assert.match(
    sql,
    /USING \(tenant_id = \(select current_setting\('app\.current_tenant_id', true\)\)::text\)/u
  );
  assert.match(
    sql,
    /WITH CHECK \(tenant_id = \(select current_setting\('app\.current_tenant_id', true\)\)::text\)/u
  );
});

test('schema exports claim document AI extraction consents table', async () => {
  const schema = await import('../src/schema');

  assert.ok(schema.claimDocumentAiExtractionConsents);
  assert.ok(schema.claimDocumentAiExtractionConsents.tenantId);
  assert.ok(schema.claimDocumentAiExtractionConsents.subjectId);
  assert.ok(schema.claimDocumentAiExtractionConsents.claimId);
  assert.ok(schema.claimDocumentAiExtractionConsents.documentId);
  assert.ok(schema.claimDocumentAiExtractionConsents.processingPurpose);
});
