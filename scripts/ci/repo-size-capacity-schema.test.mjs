import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCapacityBudget } from '../repo-size-capacity-schema.mjs';
import { allocationBudget } from './repo-size-capacity-fixtures.mjs';

const invalidCases = [
  ['rejects new keys', budget => (budget.freeCapacity = 10), /unsupported key: freeCapacity/u],
  [
    'rejects new categories',
    budget => (budget.maxCategoryBytes.generated = 1),
    /category set mismatch/u,
  ],
  [
    'rejects unnamed ceiling growth',
    budget => budget.maxTrackedBytes++,
    /baseline plus named allocations/u,
  ],
  [
    'rejects duplicate ids',
    budget => (budget.allocations[1].id = budget.allocations[0].id),
    /ids must be unique/u,
  ],
  [
    'rejects overlapping paths',
    budget => {
      budget.allocations[1].writerPaths[0] = 'scripts/repo-size-budget.json';
      budget.allocations[1].maxPathBytesDelta = {
        'scripts/repo-size-budget.json': 20,
        'scripts/lean.test.mjs': 10,
      };
    },
    /writerPaths must be disjoint/u,
  ],
  [
    'rejects free file slots',
    budget => (budget.allocations[1].maxTrackedFilesDelta = 1),
    /baseline plus named allocations/u,
  ],
];

test('capacity schema accepts closed allocation contract', () => {
  const budget = allocationBudget();
  assert.equal(validateCapacityBudget(budget), budget);
});

test('capacity schema reports non-negative integer requirement', () => {
  const budget = allocationBudget();
  budget.reserve.trackedBytes = -1;
  assert.throws(
    () => validateCapacityBudget(budget),
    /reserve\.trackedBytes must be a non-negative integer\./u
  );
});

for (const [name, mutate, expected] of invalidCases) {
  test(`capacity schema ${name}`, () => {
    const budget = allocationBudget();
    mutate(budget);
    assert.throws(() => validateCapacityBudget(budget), expected);
  });
}

test('capacity schema accepts bounded path headroom', () => {
  const budget = allocationBudget();
  budget.allocations[1].maxPathBytesDelta['scripts/lean.mjs'] = 21;
  assert.equal(validateCapacityBudget(budget), budget);
});
