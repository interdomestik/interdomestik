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

test('repair SQL is dry-run-first, aggregate-only, and post-drop non-destructive', () => {
  assert.match(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /\bselect\b/iu);
  assert.doesNotMatch(
    CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL,
    /\b(update|insert|delete|drop|alter)\b/iu
  );
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /blocked_post_status_drop/u);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\b(update|delete|drop|alter)\b/iu);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\breturning\s+c\.id\b/iu);
});

test('repair SQL no longer depends on the removed claim status column', () => {
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /\bc\.status\b/u);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\bc\.status\b/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /blocked_missing_lifecycle/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /case_lifecycle_state is null/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_DRY_RUN_SQL, /recovery_lifecycle_state is null/u);
});

test('apply path is an explicit post-drop no-op that returns aggregate shape', () => {
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /select 'blocked_post_status_drop' as action/u);
  assert.match(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /0::int as count/u);
  assert.doesNotMatch(CLAIM_LIFECYCLE_REPAIR_APPLY_SQL, /\breturning\s+c\.\*/iu);
});

test('repair report summarizes post-drop blocked groups', () => {
  const summary = summarizeLifecycleRepair([
    {
      action: 'blocked_missing_lifecycle',
      status: null,
      case_lifecycle_state: null,
      recovery_lifecycle_state: null,
      count: '2',
    },
    { action: 'blocked_post_status_drop', status: null, count: 0 },
  ]);

  assert.equal(summary.total, 2);
  assert.deepEqual(summary.byAction, {
    blocked_missing_lifecycle: 2,
    blocked_post_status_drop: 0,
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
  const rows = [{ action: 'blocked_missing_lifecycle', status: null, count: 1 }];
  assert.deepEqual(normalizeRepairExecuteRows(rows), rows);
  assert.deepEqual(normalizeRepairExecuteRows({ rows }), rows);
  assert.throws(
    () => normalizeRepairExecuteRows({ rowCount: 1 }),
    /Unexpected lifecycle repair query result shape/u
  );
});

test('formats aggregate-only rollback and observability handoff evidence', () => {
  const report = JSON.parse(
    formatLifecycleRepairReport([{ action: 'blocked_missing_lifecycle', status: null, count: 1 }], {
      generatedAt: '2026-06-22T00:00:00.000Z',
    })
  );

  assert.equal(report.mode, 'dry_run');
  assert.equal(report.pii, 'aggregate_counts_only');
  assert.match(report.rollback, /Re-run inventory/u);
  assert.equal(report.byAction.blocked_missing_lifecycle, 1);
});
