import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { user } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'packages/database/drizzle/0081_user_residence_country.sql'
);

test('user schema exports nullable residence country distinct from tenant', () => {
  assert.equal(user.residenceCountry.name, 'residence_country');
  assert.equal(user.residenceCountry.notNull, false);
  assert.equal(user.tenantId.name, 'tenant_id');
});

test('residence country is positioned after tenant identity', () => {
  const keys = Object.keys(user);
  const tenantIdIdx = keys.indexOf('tenantId');
  const residenceCountryIdx = keys.indexOf('residenceCountry');
  assert.ok(tenantIdIdx >= 0, 'tenantId must exist');
  assert.ok(residenceCountryIdx > tenantIdIdx, 'residenceCountry must follow tenantId');
});

test('user residence country migration is additive and not host-derived', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE "user" ADD COLUMN "residence_country" text;/u);
  assert.match(
    sql,
    /"residence_country" IS NULL OR "user"\."residence_country" ~ '\^\[A-Z\]\{2\}\$'/u
  );
  assert.match(sql, /User-declared residence country; distinct from tenant_id and host/u);
  assert.doesNotMatch(sql, /"residence_country" text NOT NULL/u);
  assert.doesNotMatch(sql, /UPDATE "user"/u);
  assert.doesNotMatch(sql, /SET "residence_country"/u);
});
