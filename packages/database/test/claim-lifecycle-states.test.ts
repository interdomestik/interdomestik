import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { claims } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(
  repoRoot,
  'packages/database/drizzle/0071_claim_lifecycle_states.sql'
);

test('claim schema exports nullable lifecycle state columns', () => {
  assert.equal(claims.caseLifecycleState.name, 'case_lifecycle_state');
  assert.equal(claims.recoveryLifecycleState.name, 'recovery_lifecycle_state');
  assert.equal(claims.caseLifecycleState.notNull, false);
  assert.equal(claims.recoveryLifecycleState.notNull, false);
});

test('claim lifecycle state migration is additive and nullable', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER TABLE "claim" ADD COLUMN "case_lifecycle_state" text;/u);
  assert.match(sql, /ALTER TABLE "claim" ADD COLUMN "recovery_lifecycle_state" text;/u);
  assert.match(
    sql,
    /"claim_case_lifecycle_state_check" CHECK \("claim"\."case_lifecycle_state" is null or "claim"\."case_lifecycle_state" in \('draft', 'submitted', 'verification', 'evaluation', 'recovery', 'resolved', 'rejected'\)\) NOT VALID/u
  );
  assert.match(
    sql,
    /"claim_recovery_lifecycle_state_check" CHECK \("claim"\."recovery_lifecycle_state" is null or "claim"\."recovery_lifecycle_state" in \('not_started', 'negotiation', 'court', 'resolved', 'closed'\)\) NOT VALID/u
  );
  assert.doesNotMatch(sql, /case_lifecycle_state" text NOT NULL/u);
  assert.doesNotMatch(sql, /recovery_lifecycle_state" text NOT NULL/u);
});
