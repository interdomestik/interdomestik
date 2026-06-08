import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const DB_ROOT = join(import.meta.dirname, '..');

describe('ARCH-M1-12 deferred-backfills', () => {
  describe('migration 0078 — tenant code backfill', () => {
    const sql = readFileSync(join(DB_ROOT, 'drizzle', '0078_backfill_tenant_codes.sql'), 'utf-8');

    it('contains UPDATE tenants SET code for NULL rows', () => {
      assert.match(sql, /UPDATE\s+"tenants"/i);
      assert.match(sql, /SET\s+"code"\s*=/i);
      assert.match(sql, /WHERE\s+"code"\s+IS\s+NULL/i);
    });

    it('derives code from id using SPLIT_PART and UPPER', () => {
      assert.match(sql, /UPPER\s*\(\s*SPLIT_PART/i);
      assert.match(sql, /'_'\s*,\s*2/);
    });

    it('contains no ALTER TABLE or schema-structural DDL', () => {
      assert.doesNotMatch(sql, /ALTER\s+TABLE/i);
      assert.doesNotMatch(sql, /CREATE\s+(UNIQUE\s+)?INDEX/i);
    });
  });

  describe('tenants.ts schema — code column', () => {
    const src = readFileSync(join(DB_ROOT, 'src', 'schema', 'tenants.ts'), 'utf-8');

    it('code column has .unique() call', () => {
      assert.match(src, /code.*\.unique\(\)/);
    });

    it('code column comment no longer says "Nullable for migration"', () => {
      assert.doesNotMatch(src, /Nullable for migration/);
    });

    it('code column comment references migration 0078 backfill', () => {
      assert.match(src, /0078/);
    });
  });

  describe('claims.ts schema — claimNumber uniqueIndex', () => {
    const src = readFileSync(join(DB_ROOT, 'src', 'schema', 'claims.ts'), 'utf-8');

    it('uniqueIndex idx_claims_tenant_number has no "Enable after backfill" comment', () => {
      assert.doesNotMatch(src, /Enable after backfill/);
    });

    it('claimNumber column comment no longer says "Nullable for migration"', () => {
      assert.doesNotMatch(src, /Nullable for migration/);
    });

    it('uniqueIndex on tenantId and claimNumber is present', () => {
      assert.match(src, /uniqueIndex\('idx_claims_tenant_number'\)/);
    });
  });
});
