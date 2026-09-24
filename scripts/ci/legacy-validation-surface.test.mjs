import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateLegacyValidation, parseChangedFiles } from './legacy-validation-surface.mjs';

test('ordinary product and active-plan changes skip full legacy validation', () => {
  assert.deepEqual(
    evaluateLegacyValidation({
      changedFiles: ['apps/web/src/features/member/home.tsx', 'docs/plans/current-program.md'],
    }),
    { shouldRun: false, reason: 'legacy_surface_unchanged', matchedPaths: [] }
  );
});

test('legacy artifacts, consumers and selection policy run full legacy validation', () => {
  for (const changedPath of [
    'docs/plans/current-authority-v1.json',
    'docs/plans/history/current-authority/2026-08-16-through-rev-243.manifest.json',
    'docs/plans/history/2026-09-22-current-program-ledger.md',
    'scripts/current-authority-format-audit.mjs',
    'scripts/lean-current-authority-policy.mjs',
    'scripts/slice-rehearse-core.mjs',
    'scripts/slice-telemetry.mjs',
    'scripts/ci/lean-current-authority-contracts.legacy.mjs',
    'scripts/ci/exact-delivery.mjs',
    'scripts/ci/exact-delivery-lib.mjs',
    'scripts/ci/exact-delivery.test.mjs',
    'scripts/ci/legacy-validation-surface.mjs',
    '.github/actions/validation-surface/action.yml',
    '.github/workflows/ci.yml',
  ]) {
    const result = evaluateLegacyValidation({ changedFiles: [changedPath] });
    assert.equal(result.shouldRun, true, changedPath);
    assert.deepEqual(result.matchedPaths, [changedPath], changedPath);
  }
});

test('name-status parsing retains both endpoints of legacy renames', () => {
  const changedFiles = parseChangedFiles(
    [
      'M\tapps/web/src/example.ts',
      'R100\tscripts/lean-demo.mjs\tapps/web/src/renamed-demo.mjs',
      'C087\tscripts/ci/exact-delivery.mjs\tscripts/copied-delivery.mjs',
      '',
    ].join('\n')
  );
  assert.deepEqual(changedFiles, [
    'apps/web/src/example.ts',
    'scripts/lean-demo.mjs',
    'apps/web/src/renamed-demo.mjs',
    'scripts/ci/exact-delivery.mjs',
    'scripts/copied-delivery.mjs',
  ]);
  assert.deepEqual(evaluateLegacyValidation({ changedFiles }), {
    shouldRun: true,
    reason: 'legacy_surface_changed',
    matchedPaths: ['scripts/ci/exact-delivery.mjs', 'scripts/lean-demo.mjs'],
  });
});

test('malformed name-status output fails closed', () => {
  assert.throws(() => parseChangedFiles('not-a-status\tscripts/lean-demo.mjs'), /malformed/u);
});

test('package changes select legacy validation only when legacy commands change', () => {
  const before = JSON.stringify({ scripts: { test: 'node --test', 'test:harness-v2': 'old' } });
  const ordinaryAfter = JSON.stringify({
    scripts: { test: 'node --test --watch', 'test:harness-v2': 'old' },
  });
  const legacyAfter = JSON.stringify({
    scripts: { test: 'node --test', 'test:harness-v2': 'new' },
  });
  assert.equal(
    evaluateLegacyValidation({
      changedFiles: ['package.json'],
      packageBefore: before,
      packageAfter: ordinaryAfter,
    }).shouldRun,
    false
  );
  assert.deepEqual(
    evaluateLegacyValidation({
      changedFiles: ['package.json'],
      packageBefore: before,
      packageAfter: legacyAfter,
    }),
    { shouldRun: true, reason: 'legacy_surface_changed', matchedPaths: ['package.json'] }
  );
});

test('repository budget changes select legacy validation only for the legacy allocation', () => {
  const before = JSON.stringify({
    allocations: [
      { id: 'ordinary', writerPaths: ['apps/web/src/example.ts'] },
      { id: 'staff-current-claim-policy', writerPaths: ['scripts/ci/old.legacy.mjs'] },
    ],
  });
  const ordinaryAfter = JSON.stringify({
    allocations: [
      { id: 'ordinary', writerPaths: ['apps/web/src/example.ts', 'apps/web/src/next.ts'] },
      { id: 'staff-current-claim-policy', writerPaths: ['scripts/ci/old.legacy.mjs'] },
    ],
  });
  const legacyAfter = JSON.stringify({
    allocations: [
      { id: 'ordinary', writerPaths: ['apps/web/src/example.ts'] },
      { id: 'staff-current-claim-policy', writerPaths: ['scripts/ci/new.legacy.mjs'] },
    ],
  });
  assert.equal(
    evaluateLegacyValidation({
      changedFiles: ['scripts/repo-size-budget.json'],
      budgetBefore: before,
      budgetAfter: ordinaryAfter,
    }).shouldRun,
    false
  );
  assert.deepEqual(
    evaluateLegacyValidation({
      changedFiles: ['scripts/repo-size-budget.json'],
      budgetBefore: before,
      budgetAfter: legacyAfter,
    }),
    {
      shouldRun: true,
      reason: 'legacy_surface_changed',
      matchedPaths: ['scripts/repo-size-budget.json'],
    }
  );
});

test('incomplete or malformed change evidence fails toward running legacy proof', () => {
  assert.deepEqual(evaluateLegacyValidation({ evidenceComplete: false }), {
    shouldRun: true,
    reason: 'changed_files_incomplete',
    matchedPaths: [],
  });
  assert.equal(
    evaluateLegacyValidation({
      changedFiles: ['package.json'],
      packageBefore: '{',
      packageAfter: '{}',
    }).shouldRun,
    true
  );
});
