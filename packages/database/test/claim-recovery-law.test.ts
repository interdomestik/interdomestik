import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { claims } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(repoRoot, 'packages/database/drizzle/0082_claim_recovery_law.sql');

test('claim schema exports nullable recovery law routing columns', () => {
  assert.equal(claims.recoveryLaw.name, 'recovery_law');
  assert.equal(claims.recoveryLegalTenantId.name, 'recovery_legal_tenant_id');
  assert.equal(claims.recoveryLaw.notNull, false);
  assert.equal(claims.recoveryLegalTenantId.notNull, false);
});

test('recovery law columns are positioned after incident jurisdiction', () => {
  const keys = Object.keys(claims);
  const incidentJurisdictionIdx = keys.indexOf('incidentJurisdiction');
  const recoveryLawIdx = keys.indexOf('recoveryLaw');
  const recoveryTenantIdx = keys.indexOf('recoveryLegalTenantId');
  assert.ok(incidentJurisdictionIdx >= 0, 'incidentJurisdiction must exist');
  assert.ok(recoveryLawIdx > incidentJurisdictionIdx, 'recoveryLaw must follow incident data');
  assert.ok(
    recoveryTenantIdx > incidentJurisdictionIdx,
    'recovery tenant must follow incident data'
  );
});

test('claim recovery law migration is additive and compatibility-safe', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE "claim" ADD COLUMN "recovery_law" text;/u);
  assert.match(sql, /ALTER TABLE "claim" ADD COLUMN "recovery_legal_tenant_id" text;/u);
  assert.match(
    sql,
    /FOREIGN KEY \("recovery_legal_tenant_id"\) REFERENCES "public"\."tenants"\("id"\)/u
  );
  assert.match(sql, /"recovery_law" is null or "claim"\."recovery_law" ~ '\^\[A-Z\]\{2\}\$'/u);
  assert.doesNotMatch(sql, /"recovery_law" text NOT NULL/u);
  assert.doesNotMatch(sql, /"recovery_legal_tenant_id" text NOT NULL/u);
  assert.doesNotMatch(sql, /UPDATE "claim"/u);
});
