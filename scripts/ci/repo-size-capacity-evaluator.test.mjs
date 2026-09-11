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

test('canonical authority size cannot hide another oversized tracked file', () => {
  const budget = allocationBudget();
  const report = capacityReport();
  report.tracked.largestFiles = [
    { path: 'docs/plans/current-program.md', bytes: budget.maxLargestFileBytes + 200_000 },
    { path: 'docs/ordinary.md', bytes: budget.maxLargestFileBytes + 1 },
  ];
  report.tracked.largestCapacityFile = report.tracked.largestFiles[1];

  const result = evaluateCapacityBudget(report, budget, acceptedChangeFacts());

  assert.equal(hasViolation(result, 'largest-file-bytes'), true);
  assert.equal(
    result.violations.find(item => item.code === 'largest-file-bytes')?.path,
    'docs/ordinary.md'
  );
});

test('truncated largest-file reporting cannot hide an oversized ordinary file', () => {
  const budget = allocationBudget();
  const report = capacityReport();
  report.tracked.largestFiles = [
    { path: 'docs/plans/current-program.md', bytes: budget.maxLargestFileBytes + 200_000 },
  ];
  report.tracked.largestCapacityFile = {
    path: 'docs/ordinary.md',
    bytes: budget.maxLargestFileBytes + 1,
  };

  const result = evaluateCapacityBudget(report, budget, acceptedChangeFacts());

  assert.equal(hasViolation(result, 'largest-file-bytes'), true);
  assert.equal(
    result.violations.find(item => item.code === 'largest-file-bytes')?.path,
    'docs/ordinary.md'
  );
});

test('canonical authority growth remains Git-attributed without consuming byte capacity', () => {
  const budget = allocationBudget();
  budget.allocations.push({
    id: 'canonical-authority',
    mode: 'bounded',
    writerPaths: ['docs/plans/current-program.md'],
    maxTrackedBytesDelta: 0,
    maxTrackedFilesDelta: 0,
    maxCategoryBytesDelta: {},
    maxPathBytesDelta: { 'docs/plans/current-program.md': 0 },
  });
  const facts = [
    ...acceptedChangeFacts(),
    { path: 'docs/plans/current-program.md', bytesDelta: 200_000, filesDelta: 0 },
  ];
  const report = capacityReport({ bytes: 201_040 });
  report.tracked.categories.find(item => item.name === 'docs/text').bytes = 200_100;
  report.tracked.largestFiles = [
    { path: 'docs/plans/current-program.md', bytes: 300_000 },
    { path: 'scripts/lean.mjs', bytes: 500 },
  ];

  const result = evaluateCapacityBudget(report, budget, facts);

  assert.deepEqual(result.violations, []);
});

test('Git attribution accepts deterministic statuses and fails closed on renames', () => {
  assert.deepEqual(parseGitNameStatus(Buffer.from('M\0scripts/a.mjs\0A\0scripts/b.mjs\0')), [
    { status: 'M', path: 'scripts/a.mjs' },
    { status: 'A', path: 'scripts/b.mjs' },
  ]);
  assert.throws(() => parseGitNameStatus(Buffer.from('M\0')), /malformed/u);
  assert.throws(() => parseGitNameStatus(Buffer.from('R100\0old\0')), /unsupported status/u);
});

test('semantic growth is netted globally without moving category headroom', () => {
  for (const growth of [50, 100, 150]) {
    const budget = allocationBudget();
    const facts = [
      ...acceptedChangeFacts(),
      { path: 'docs/plans/current-program.md', bytesDelta: -100, filesDelta: 0 },
      { path: 'docs/plans/current-tracker.md', bytesDelta: growth, filesDelta: 0 },
    ];
    const exemption = Math.max(0, growth - 100);
    const report = capacityReport({ bytes: budget.maxTrackedBytes + exemption + 1 });
    const category = budgetCategory('docs/plans/current-tracker.md');
    report.tracked.categories.find(item => item.name === category).bytes =
      budget.maxCategoryBytes[category] + growth;
    const result = evaluateCapacityBudget(report, budget, facts);
    assert.ok(
      result.violations.some(item => item.code === 'tracked-bytes'),
      `growth ${growth}`
    );
    assert.ok(!result.violations.some(item => item.code === `category:${category}`));
  }
});

test('bounded ordinary allocation totals exclude semantic writer allowances', () => {
  const budget = allocationBudget();
  const owner = budget.allocations[1];
  const program = 'docs/plans/current-program.md';
  owner.writerPaths.push(program);
  owner.maxPathBytesDelta[program] = 100;
  owner.maxTrackedBytesDelta += 100;
  owner.maxCategoryBytesDelta['docs/text'] = 100;
  budget.maxTrackedBytes += 100;
  budget.maxCategoryBytes['docs/text'] += 100;
  const facts = [...acceptedChangeFacts(), { path: program, bytesDelta: 100, filesDelta: 0 }];
  facts.find(item => item.path === 'scripts/lean.mjs').bytesDelta += 1;
  const result = evaluateCapacityBudget(capacityReport(), budget, facts);
  assert.ok(result.violations.some(item => item.code === 'allocation-bytes:lean-repair'));
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
      largestCapacityFile: { path: 'pnpm-lock.yaml', bytes: budget.maxLargestFileBytes },
      largestFiles: [{ path: 'pnpm-lock.yaml', bytes: budget.maxLargestFileBytes }],
      sourceHotspots: [{ path: 'baseline-hotspot', lines: budget.maxSourceOrTestLines }],
    },
  };
  assert.equal(evaluateCapacityBudget(report, budget, values).passed, true);
});
