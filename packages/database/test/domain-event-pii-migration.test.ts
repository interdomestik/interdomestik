import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const migration = readFileSync('drizzle/0080_event_pii_references.sql', 'utf8');

describe('event PII reference migration', () => {
  it('creates tenant-scoped reference and key tables', () => {
    assert.match(migration, /CREATE TABLE "event_pii_references"/);
    assert.match(migration, /CREATE TABLE "event_pii_keys"/);
    assert.match(migration, /"encrypted_payload" text NOT NULL/);
    assert.match(migration, /"key_ciphertext" text NOT NULL/);
    assert.match(migration, /"destroyed_at" timestamp with time zone/);
  });

  it('keeps encrypted PII references separate from key material', () => {
    const referenceTable = migration.slice(
      migration.indexOf('CREATE TABLE "event_pii_references"'),
      migration.indexOf('CREATE TABLE "event_pii_keys"')
    );
    const keyTable = migration.slice(
      migration.indexOf('CREATE TABLE "event_pii_keys"'),
      migration.indexOf('ALTER TABLE "event_pii_references"')
    );

    assert.doesNotMatch(referenceTable, /"key_ciphertext"/);
    assert.doesNotMatch(keyTable, /"encrypted_payload"/);
  });

  it('links references to domain events and keys to references without cross-tenant joins', () => {
    assert.match(migration, /"event_pii_references_tenant_event_fk"/);
    assert.match(migration, /REFERENCES "public"."domain_events"\("tenant_id","id"\)/);
    assert.match(migration, /"event_pii_keys_tenant_reference_fk"/);
    assert.match(migration, /REFERENCES "public"."event_pii_references"\("tenant_id","id"\)/);
    assert.ok(
      migration.indexOf('"event_pii_references_tenant_id_id_uq"') <
        migration.indexOf('"event_pii_keys_tenant_reference_fk"'),
      'reference unique key must exist before the composite key FK is added'
    );
  });

  it('enables tenant-isolated RLS for both tables', () => {
    assert.match(migration, /ALTER TABLE public\."event_pii_references" ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /tenant_isolation_event_pii_references/);
    assert.match(migration, /ALTER TABLE public\."event_pii_keys" ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /tenant_isolation_event_pii_keys/);
    assert.match(migration, /tenant_setting constant text := 'app\.current_tenant_id'/);
    assert.match(
      migration,
      /tenant_predicate constant text := 'tenant_id = \(select current_setting\(%L, true\)\)::text'/
    );
    assert.match(migration, /EXECUTE format\(/);
    assert.doesNotMatch(
      migration,
      /tenant_id = current_setting\('app\.current_tenant_id', true\)::text/
    );
  });
});
