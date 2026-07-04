import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { claims } from '../src/schema';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrationPath = path.join(repoRoot, 'packages/database/drizzle/0071_claim_lifecycle_states.sql');
const dropStatusMigrationPath = path.join(repoRoot, 'packages/database/drizzle/0091_t503_drop_claim_status.sql');

test('claim schema requires lifecycle state columns', () => {
  assert.equal(claims.caseLifecycleState.name, 'case_lifecycle_state');
  assert.equal(claims.recoveryLifecycleState.name, 'recovery_lifecycle_state');
  assert.equal(claims.caseLifecycleState.notNull, true);
  assert.equal(claims.recoveryLifecycleState.notNull, true);
});

test('0071 claim lifecycle migration stays additive', () => {
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

test('0091 claim status drop migration enforces canonical pairs', () => {
  const sql = fs.readFileSync(dropStatusMigrationPath, 'utf8');

  assert.match(sql, /ADD CONSTRAINT "claim_lifecycle_state_pair_check" CHECK/u);
  assert.match(sql, /CASE \("status"::text\)/u);
  assert.match(sql, /\("case_lifecycle_state","recovery_lifecycle_state"\) IN/u);
  assert.match(sql, /\('recovery','submitted_to_airline'\)/u);
  assert.match(sql, /\('rejected','closed'\)/u);
  assert.match(sql, /DROP COLUMN IF EXISTS "status"/u);
});
