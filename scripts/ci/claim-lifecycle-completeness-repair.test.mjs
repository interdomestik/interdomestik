import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CLAIM_LIFECYCLE_REPAIR_APPLY_SQL,
  CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL,
  formatLifecycleRepairReport,
  normalizeRepairExecuteRows,
  summarizeLifecycleRepair,
} from '../claim-lifecycle-completeness-repair-report.mjs';

test('repair SQL is dry-run-first, aggregate-only, and non-destructive', () => {
  assert.match(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /\bselect\b/iu);
  assert.doesNotMatch(
    CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL,
    /\b(update|insert|delete|drop|alter)\b/iu
  );
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\bupdate claim\b/iu);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\b(delete|drop|alter)\b/iu);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\breturning\s+c\.id\b/iu);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /"updatedAt" = now\(\)/u);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /(^|\n)\s+updatedAt = now\(\)/u);
});

test('repair SQL does not overwrite non-null lifecycle mismatches', () => {
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /case_lifecycle_state is null/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /recovery_lifecycle_state is null/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /coalesce/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /from expected e/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /where e\.status = c\.status::text/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /blocked_partial_mismatch/u);
});

test('apply path only targets mappable incomplete rows and returns aggregate counts', () => {
  assert.match(
    CLAIM_LIFECYCLE_REPAIR_APPLY_SQL,
    /\(c\.case_lifecycle_state is null or c\.recovery_lifecycle_state is null\)/u
  );
  assert.match(
    CLAIM_LIFECYCLE_REPAIR_APPLY_SQL,
    /c\.case_lifecycle_state is null or c\.case_lifecycle_state::text = e\.case_lifecycle_state/u
  );
  assert.match(
    CLAIM_LIFECYCLE_REPAIR_APPLY_SQL,
    /c\.recovery_lifecycle_state is null\s+or c\.recovery_lifecycle_state::text = e\.recovery_lifecycle_state/u
  );
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /select 'repaired' as action/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /count\(\*\)::int as count/u);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\breturning\s+c\.\*/iu);
});

test('repair report summarizes repairable, blocked, unmappable, and repaired groups', () => {
  const summary = summarizeLifecycleRepair([
    { action: 'repairable', status: 'submitted', case_lifecycle_state: null, count: 3 },
    {
      action: 'blocked_partial_mismatch',
      status: 'resolved',
      case_lifecycle_state: 'recovery',
      recovery_lifecycle_state: null,
      count: '2',
    },
    { action: 'unmappable_incomplete', status: null, count: 1 },
    {
      action: 'repaired',
      status: 'court',
      case_lifecycle_state: 'recovery',
      recovery_lifecycle_state: 'court',
      count: 4,
    },
  ]);

  assert.equal(summary.total, 10);
  assert.deepEqual(summary.byAction, {
    repairable: 3,
    blocked_partial_mismatch: 2,
    unmappable_incomplete: 1,
    repaired: 4,
  });
});

test('live repair script uses admin system connection and defaults to dry-run', () => {
  const source = readFileSync('scripts/claim-lifecycle-completeness-repair.ts', 'utf8');

  assert.match(source, /\{\s*dbAdmin,\s*sql\s*\}\s*=\s*await import/u);
  assert.match(source, /dbAdmin\.execute/u);
  assert.match(source, /process\.argv\.includes\('--apply'\)/u);
  assert.doesNotMatch(source, /\{\s*db,\s*sql\s*\}\s*=\s*await import/u);
});

test('normalizes execute rows without accepting ambiguous shapes', () => {
  const rows = [{ action: 'repairable', status: 'draft', count: 1 }];
  assert.deepEqual(normalizeRepairExecuteRows(rows), rows);
  assert.deepEqual(normalizeRepairExecuteRows({ rows }), rows);
  assert.throws(
    () => normalizeRepairExecuteRows({ rowCount: 1 }),
    /Unexpected lifecycle repair query result shape/u
  );
});

test('formats aggregate-only rollback and observability handoff evidence', () => {
  const report = JSON.parse(
    formatLifecycleRepairReport([{ action: 'repairable', status: 'draft', count: 1 }], {
      generatedAt: '2026-06-22T00:00:00.000Z',
    })
  );

  assert.equal(report.mode, 'dry_run');
  assert.equal(report.pii, 'aggregate_counts_only');
  assert.match(report.rollback, /Re-run inventory/u);
  assert.equal(report.byAction.repairable, 1);
});
