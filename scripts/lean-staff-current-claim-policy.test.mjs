import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWriterPath, validateSlice } from './lean-current-authority-policy.mjs';
import { resolveAuthority } from './lean-current-authority-lifecycle.mjs';

// These are explicitly synthetic test fixtures, never approval or runtime evidence.
const writers = [
  'packages/domain-claims/src/staff-claims/current-claim-record.test.ts',
  'packages/domain-claims/src/staff-claims/current-claim-record.ts',
  'packages/domain-claims/src/staff-claims/matter-allowance.test.ts',
  'packages/domain-claims/src/staff-claims/matter-allowance.ts',
  'packages/domain-claims/src/staff-claims/update-status.test.ts',
  'packages/domain-claims/src/staff-claims/update-status.transaction.test.ts',
  'packages/domain-claims/src/staff-claims/update-status.ts',
];
const priorWriters = [writers[0], writers[1], writers[4], writers[6]];
const slice = {
  sliceId: 'STAFF-CURRENT-CLAIM-TENANT-CONTEXT',
  tier: 3,
  promotionPrNumber: 1,
  promotionBaseSha: '0'.repeat(40),
  expectedProductBranch: 'codex/staff-current-claim-tenant-context',
  gateSha256: 'a'.repeat(64),
  admissionSha256: 'b'.repeat(64),
  productWriterPaths: writers,
  closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
};

test('admits only the exact staff current-claim map and identity', () => {
  assert.equal(validateSlice(slice), slice);
  assert.doesNotThrow(() => validateSlice({ ...slice, productWriterPaths: priorWriters }));
  for (const path of writers) assert.equal(classifyWriterPath(path, slice).allowed, true);
  for (const invalid of [
    { ...slice, tier: 2 },
    { ...slice, sliceId: 'OTHER-SLICE' },
    { ...slice, productWriterPaths: writers.slice(1) },
    { ...slice, productWriterPaths: [...writers].reverse() },
    { ...slice, productWriterPaths: [...writers, 'packages/database/src/tenant.ts'] },
  ])
    assert.throws(() => validateSlice(invalid), /schema or policy mismatch/);
});

test('keeps adjacent protected surfaces denied', () => {
  for (const path of [
    'packages/database/src/tenant.ts',
    'apps/web/src/proxy.ts',
    'packages/domain-ai/src/claims/intake-extract.ts',
    'apps/web/src/lib/ai/claim-pipeline-run.ts',
    'docs/plans/architecture-finalization-program-2026-05-29.md',
  ])
    assert.equal(classifyWriterPath(path, slice).allowed, false);
});

test('policy admission alone cannot grant runtime without merged owner promotion', () => {
  const result = resolveAuthority(
    {
      schemaVersion: 1,
      authority: 'lean-tier12-v1',
      lifecycle: 'promotion_pending',
      owner: { login: 'arbenl', id: 62884977 },
      activeSlice: slice,
    },
    {}
  );
  assert.equal(result.runtimeAuthorized, false);
  assert.equal(result.reason, 'promotion_identity_mismatch');
});

// Capacity measured from an in-memory signature/caller/mock/regression candidate.
// No product file was written or executed; these are candidate bounds, not proof.
// Baseline / candidate bytes, in writer-map order:
// current-claim-record.test.ts: 0 / 2367; current-claim-record.ts: 1420 / 1372
// matter-allowance.test.ts: 4670 / 6257; matter-allowance.ts: 6160 / 6367
// update-status.test.ts: 29315 / 28231; update-status.transaction.test.ts: 0 / 5830
// update-status.ts: 17286 / 17760. Baselines precede candidates on every pair.
test('capacity reserves the product, policy, CI loader and promotion artifact paths', async () => {
  const { readFileSync } = await import('node:fs');
  const { validateCapacityBudget } = await import('./repo-size-capacity-schema.mjs');
  const budget = validateCapacityBudget(
    JSON.parse(readFileSync(new URL('./repo-size-budget.json', import.meta.url), 'utf8'))
  );
  const allocation = budget.allocations.find(
    item => item.id === 'staff-current-claim-tenant-context'
  );
  assert.deepEqual(allocation.writerPaths, writers);
  assert.equal(allocation.maxTrackedFilesDelta, 2);
  assert.deepEqual(allocation.maxPathBytesDelta, {
    'packages/domain-claims/src/staff-claims/current-claim-record.test.ts': 2368,
    'packages/domain-claims/src/staff-claims/current-claim-record.ts': 0,
    'packages/domain-claims/src/staff-claims/matter-allowance.test.ts': 1587,
    'packages/domain-claims/src/staff-claims/matter-allowance.ts': 207,
    'packages/domain-claims/src/staff-claims/update-status.test.ts': 0,
    'packages/domain-claims/src/staff-claims/update-status.transaction.test.ts': 5830,
    'packages/domain-claims/src/staff-claims/update-status.ts': 474,
  });
  const policyAllocation = budget.allocations.find(
    item => item.id === 'staff-current-claim-policy'
  );
  assert.deepEqual(policyAllocation.writerPaths, [
    'scripts/ci/lean-current-authority-contracts.test.mjs',
    'scripts/lean-staff-current-claim-exception.mjs',
    'scripts/lean-staff-current-claim-policy.test.mjs',
  ]);
  assert.equal(policyAllocation.maxTrackedFilesDelta, 2);
  assert.equal(
    policyAllocation.maxPathBytesDelta['scripts/lean-staff-current-claim-exception.mjs'],
    1000
  );
  const promotionAllocation = budget.allocations.find(
    item => item.id === 'staff-current-claim-tenant-context-promotion'
  );
  assert.deepEqual(promotionAllocation.writerPaths, [
    'docs/plans/2026-09-10-staff-current-claim-tenant-context-design-gate.md',
    'docs/plans/2026-09-10-staff-current-claim-tenant-context-admission.json',
  ]);
  assert.equal(promotionAllocation.maxTrackedFilesDelta, 2);
  assert.deepEqual(promotionAllocation.maxPathBytesDelta, {
    'docs/plans/2026-09-10-staff-current-claim-tenant-context-design-gate.md': 4500,
    'docs/plans/2026-09-10-staff-current-claim-tenant-context-admission.json': 3000,
  });
});
