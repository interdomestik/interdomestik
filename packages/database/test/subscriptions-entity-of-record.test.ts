import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { subscriptions } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'packages/database/drizzle/0077_subscriptions_entity_of_record.sql'
);

test('subscriptions schema exports nullable entity-of-record columns', () => {
  assert.equal(subscriptions.legalTenantId.name, 'legal_tenant_id');
  assert.equal(subscriptions.billingEntity.name, 'billing_entity');
  assert.equal(subscriptions.governingLawSnapshot.name, 'governing_law_snapshot');
  assert.equal(subscriptions.termsVersionAccepted.name, 'terms_version_accepted');
  assert.equal(subscriptions.legalTenantId.notNull, false);
  assert.equal(subscriptions.billingEntity.notNull, false);
  assert.equal(subscriptions.governingLawSnapshot.notNull, false);
  assert.equal(subscriptions.termsVersionAccepted.notNull, false);
});

test('entity-of-record columns are positioned after agentId', () => {
  const keys = Object.keys(subscriptions);
  const agentIdIdx = keys.indexOf('agentId');
  const legalTenantIdIdx = keys.indexOf('legalTenantId');
  const billingEntityIdx = keys.indexOf('billingEntity');
  const governingLawSnapshotIdx = keys.indexOf('governingLawSnapshot');
  const termsVersionAcceptedIdx = keys.indexOf('termsVersionAccepted');
  assert.ok(agentIdIdx >= 0, 'agentId must exist');
  assert.ok(legalTenantIdIdx > agentIdIdx, 'legalTenantId must follow agentId');
  assert.ok(billingEntityIdx > agentIdIdx, 'billingEntity must follow agentId');
  assert.ok(governingLawSnapshotIdx > agentIdIdx, 'governingLawSnapshot must follow agentId');
  assert.ok(termsVersionAcceptedIdx > agentIdIdx, 'termsVersionAccepted must follow agentId');
});

test('subscriptions entity-of-record migration is additive, backfills from tenants, and adds check constraint', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE "subscriptions" ADD COLUMN "legal_tenant_id" text;/u);
  assert.match(sql, /ALTER TABLE "subscriptions" ADD COLUMN "billing_entity" text;/u);
  assert.match(sql, /ALTER TABLE "subscriptions" ADD COLUMN "governing_law_snapshot" text;/u);
  assert.match(sql, /ALTER TABLE "subscriptions" ADD COLUMN "terms_version_accepted" text;/u);
  assert.match(
    sql,
    /UPDATE "subscriptions" SET "legal_tenant_id" = "tenant_id" WHERE "legal_tenant_id" IS NULL;/u
  );
  assert.match(
    sql,
    /"governing_law_snapshot" IS NULL OR "subscriptions"\."governing_law_snapshot" ~ '\^\[A-Z\]\{2\}\$'/u
  );
  assert.doesNotMatch(sql, /"legal_tenant_id" text NOT NULL/u);
  assert.doesNotMatch(sql, /"governing_law_snapshot" text NOT NULL/u);
  assert.doesNotMatch(sql, /"terms_version_accepted" text NOT NULL/u);
});
