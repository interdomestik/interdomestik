import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { budgetCategory } from '../repo-size-budget-sync-core.mjs';
import { evaluateCapacityBudget } from '../repo-size-capacity-evaluator.mjs';
import { parseGitNameStatus } from '../repo-size-git-attribution.mjs';
import {
  acceptedChangeFacts,
  allocationBudget,
  capacityReport,
} from './repo-size-capacity-fixtures.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function hasViolation(result, fragment) {
  return result.violations.some(item => item.code.includes(fragment));
}

test('capacity evaluator accepts only named path-bound growth', () => {
  assert.equal(
    evaluateCapacityBudget(capacityReport(), allocationBudget(), acceptedChangeFacts()).passed,
    true
  );
});

test('capacity evaluator rejects unallocated growth, padding, and reserve borrowing', () => {
  const unallocated = evaluateCapacityBudget(capacityReport(), allocationBudget(), [
    { path: 'apps/web/src/padding.ts', bytesDelta: 1, filesDelta: 0 },
  ]);
  assert.equal(hasViolation(unallocated, 'unallocated-growth'), true);

  const unallocatedEmptyFile = evaluateCapacityBudget(
    capacityReport({ files: 1021 }),
    allocationBudget(),
    [{ path: 'apps/web/src/empty.ts', bytesDelta: 0, filesDelta: 1 }]
  );
  assert.equal(hasViolation(unallocatedEmptyFile, 'unallocated-growth'), true);

  const padded = evaluateCapacityBudget(capacityReport(), allocationBudget(), [
    { path: 'scripts/lean.mjs', bytesDelta: 21, filesDelta: 0 },
  ]);
  assert.equal(hasViolation(padded, 'path-bytes'), true);

  const borrowed = evaluateCapacityBudget(
    capacityReport({ bytes: 1041, sourceBytes: 321 }),
    allocationBudget(),
    [{ path: 'scripts/lean.mjs', bytesDelta: 21, filesDelta: 0 }]
  );
  assert.equal(hasViolation(borrowed, 'allocation-category'), true);
});

test('capacity evaluator rejects file-count and hidden Git-attribution drift', () => {
  const fileOverrun = evaluateCapacityBudget(capacityReport(), allocationBudget(), [
    { path: 'scripts/lean.mjs', bytesDelta: 1, filesDelta: 1 },
  ]);
  assert.equal(hasViolation(fileOverrun, 'allocation-files'), true);

  const hidden = evaluateCapacityBudget(capacityReport({ bytes: 1001 }), allocationBudget(), []);
  assert.equal(hasViolation(hidden, 'inventory-attribution:tracked-bytes'), true);
});

test('Git attribution accepts deterministic statuses and fails closed on renames', () => {
  assert.deepEqual(parseGitNameStatus(Buffer.from('M\0scripts/a.mjs\0A\0scripts/b.mjs\0')), [
    { status: 'M', path: 'scripts/a.mjs' },
    { status: 'A', path: 'scripts/b.mjs' },
  ]);
  assert.throws(() => parseGitNameStatus(Buffer.from('M\0')), /malformed/u);
  assert.throws(() => parseGitNameStatus(Buffer.from('R100\0old\0')), /unsupported status/u);
});

test('capacity rebase permits T118 promotion without a budget edit', () => {
  const budget = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'scripts/repo-size-budget.json'), 'utf8')
  );
  const exact = budget.allocations.find(item => item.id === 'capacity-rebase');
  const promotion = budget.allocations.find(item => item.id === 't118-promotion');
  const existingPaths = new Set([
    'scripts/repo-size-budget.json',
    'scripts/repo-size-budget-sync-core.mjs',
    'scripts/repo-size-audit.mjs',
    'scripts/ci/repo-size-budget-sync.test.mjs',
  ]);
  const facts = new Map(
    exact.writerPaths.map(filePath => [
      filePath,
      {
        path: filePath,
        bytesDelta: exact.pathBytesDelta[filePath],
        filesDelta: Number(!existingPaths.has(filePath)),
      },
    ])
  );
  for (const filePath of promotion.writerPaths) {
    const prior = facts.get(filePath) ?? { path: filePath, bytesDelta: 0, filesDelta: 0 };
    facts.set(filePath, {
      ...prior,
      bytesDelta: prior.bytesDelta + promotion.maxPathBytesDelta[filePath],
      filesDelta:
        prior.filesDelta +
        Number(filePath.endsWith('-design.md') || filePath.endsWith('-admission.json')),
    });
  }
  const values = [...facts.values()];
  const categories = Object.entries(budget.baseline.categoryBytes).map(([name, bytes]) => ({
    name,
    bytes:
      bytes +
      values
        .filter(fact => budgetCategory(fact.path) === name)
        .reduce((sum, fact) => sum + fact.bytesDelta, 0),
  }));
  const report = {
    tracked: {
      total: {
        bytes:
          budget.baseline.trackedBytes + values.reduce((sum, fact) => sum + fact.bytesDelta, 0),
        files:
          budget.baseline.trackedFiles + values.reduce((sum, fact) => sum + fact.filesDelta, 0),
      },
      categories,
      largestFiles: [{ path: 'pnpm-lock.yaml', bytes: budget.maxLargestFileBytes }],
      sourceHotspots: [{ path: 'baseline-hotspot', lines: budget.maxSourceOrTestLines }],
    },
  };
  assert.equal(evaluateCapacityBudget(report, budget, values).passed, true);
});
