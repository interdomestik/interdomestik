import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { tenants } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'packages/database/drizzle/0076_tenant_governing_law_terms_version.sql'
);

test('tenant schema exports nullable governing_law and terms_version columns', () => {
  assert.equal(tenants.governingLaw.name, 'governing_law');
  assert.equal(tenants.termsVersion.name, 'terms_version');
  assert.equal(tenants.governingLaw.notNull, false);
  assert.equal(tenants.termsVersion.notNull, false);
});

test('governing_law and terms_version are positioned after country_code', () => {
  const keys = Object.keys(tenants);
  const countryCodeIdx = keys.indexOf('countryCode');
  const governingLawIdx = keys.indexOf('governingLaw');
  const termsVersionIdx = keys.indexOf('termsVersion');
  assert.ok(countryCodeIdx >= 0, 'countryCode must exist');
  assert.ok(governingLawIdx > countryCodeIdx, 'governingLaw must follow countryCode');
  assert.ok(termsVersionIdx > countryCodeIdx, 'termsVersion must follow countryCode');
});

test('tenant governing_law migration is additive and backfills from country_code', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE "tenants" ADD COLUMN "governing_law" text;/u);
  assert.match(sql, /ALTER TABLE "tenants" ADD COLUMN "terms_version" text;/u);
  assert.match(
    sql,
    /UPDATE "tenants" SET "governing_law" = UPPER\("country_code"\) WHERE "governing_law" IS NULL;/u
  );
  assert.match(sql, /"governing_law" IS NULL OR "tenants"\."governing_law" ~ '\^\[A-Z\]\{2\}\$'/u);
  assert.doesNotMatch(sql, /"governing_law" text NOT NULL/u);
  assert.doesNotMatch(sql, /"terms_version" text NOT NULL/u);
});
