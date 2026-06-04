import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { claims } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'packages/database/drizzle/0072_claim_incident_country.sql'
);

test('claim schema exports nullable incident country columns', () => {
  assert.equal(claims.incidentCountryCode.name, 'incident_country_code');
  assert.equal(claims.incidentJurisdiction.name, 'incident_jurisdiction');
  assert.equal(claims.incidentCountryCode.notNull, false);
  assert.equal(claims.incidentJurisdiction.notNull, false);
});

test('claim incident country migration is additive and scoped for reporting', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE "claim" ADD COLUMN "incident_country_code" text;/u);
  assert.match(sql, /ALTER TABLE "claim" ADD COLUMN "incident_jurisdiction" text;/u);
  assert.match(
    sql,
    /CREATE INDEX "idx_claims_tenant_incident_country" ON "claim" USING btree \("tenant_id","incident_country_code","createdAt"\);/u
  );
  assert.match(
    sql,
    /"incident_country_code" is null or "claim"\."incident_country_code" ~ '\^\[A-Z\]\{2\}\$'/u
  );
  assert.match(
    sql,
    /"incident_jurisdiction" is null or "claim"\."incident_jurisdiction" ~ '\^country:\[A-Z\]\{2\}\$'/u
  );
  assert.doesNotMatch(sql, /incident_country_code" text NOT NULL/u);
  assert.doesNotMatch(sql, /incident_jurisdiction" text NOT NULL/u);
});
