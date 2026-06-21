import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  CLAIM_LIFECYCLE_INVENTORY_SQL,
  formatLifecycleInventoryReport,
  normalizeInventoryExecuteRows,
  summarizeLifecycleInventory,
} from '../claim-lifecycle-consistency-inventory-report.mjs';

test('inventory SQL is read-only and covers all required lifecycle fields', () => {
  assert.match(CLAIM_LIFECYCLE_INVENTORY_SQL, /\bselect\b/iu);
  assert.doesNotMatch(CLAIM_LIFECYCLE_INVENTORY_SQL, /\b(update|insert|delete|drop|alter)\b/iu);
  assert.match(CLAIM_LIFECYCLE_INVENTORY_SQL, /case_lifecycle_state/u);
  assert.match(CLAIM_LIFECYCLE_INVENTORY_SQL, /recovery_lifecycle_state/u);
  assert.match(CLAIM_LIFECYCLE_INVENTORY_SQL, /status/u);
});

test('summarizes valid, invalid, incomplete, and mismatch categories', () => {
  const summary = summarizeLifecycleInventory([
    {
      category: 'valid',
      status: 'submitted',
      case_lifecycle_state: 'submitted',
      recovery_lifecycle_state: 'not_started',
      count: 3,
    },
    {
      category: 'invalid_lifecycle_pair',
      status: 'submitted',
      case_lifecycle_state: 'resolved',
      recovery_lifecycle_state: 'not_started',
      count: '2',
    },
    {
      category: 'null_incomplete',
      status: 'draft',
      case_lifecycle_state: null,
      recovery_lifecycle_state: 'not_started',
      count: 1,
    },
    {
      category: 'status_lifecycle_mismatch',
      status: 'resolved',
      case_lifecycle_state: 'recovery',
      recovery_lifecycle_state: 'court',
      count: 4,
    },
  ]);

  assert.equal(summary.total, 10);
  assert.deepEqual(summary.byCategory, {
    valid: 3,
    invalid_lifecycle_pair: 2,
    null_incomplete: 1,
    status_lifecycle_mismatch: 4,
  });
});

test('normalizes repo db.execute row arrays without dropping live rows', () => {
  const rows = [
    {
      category: 'valid',
      status: 'submitted',
      case_lifecycle_state: 'submitted',
      recovery_lifecycle_state: 'not_started',
      count: 2,
    },
  ];

  assert.deepEqual(normalizeInventoryExecuteRows(rows), rows);
  assert.deepEqual(normalizeInventoryExecuteRows({ rows }), rows);
  assert.throws(
    () => normalizeInventoryExecuteRows({ rowCount: 1 }),
    /Unexpected lifecycle inventory query result shape/u
  );
});

test('live inventory script uses the admin system connection for aggregate reads', () => {
  const source = readFileSync('scripts/claim-lifecycle-consistency-inventory.ts', 'utf8');

  assert.match(source, /\{\s*dbAdmin,\s*sql\s*\}\s*=\s*await import/u);
  assert.match(source, /dbAdmin\.execute/u);
  assert.doesNotMatch(source, /\{\s*db,\s*sql\s*\}\s*=\s*await import/u);
  assert.doesNotMatch(source, /\bwithTenantContext\b/u);
});

test('formats a stable read-only JSON report', () => {
  const report = JSON.parse(
    formatLifecycleInventoryReport(
      [{ category: 'valid', status: 'draft', case_lifecycle_state: 'draft', count: 1 }],
      { generatedAt: '2026-06-21T00:00:00.000Z' }
    )
  );

  assert.equal(report.report, 'claim_lifecycle_consistency_inventory');
  assert.equal(report.mode, 'read_only_aggregate');
  assert.equal(report.generatedAt, '2026-06-21T00:00:00.000Z');
  assert.equal(report.byCategory.valid, 1);
  assert.equal(report.groups[0].recoveryLifecycleState, null);
});
