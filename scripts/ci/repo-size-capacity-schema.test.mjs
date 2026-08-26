import assert from 'node:assert/strict';
import test from 'node:test';

import { validateCapacityBudget } from '../repo-size-capacity-schema.mjs';
import { allocationBudget } from './repo-size-capacity-fixtures.mjs';

test('capacity schema accepts the closed allocation contract', () => {
  const budget = allocationBudget();
  assert.equal(validateCapacityBudget(budget), budget);
});

test('capacity schema rejects new keys and category names', () => {
  assert.throws(
    () => validateCapacityBudget({ ...allocationBudget(), freeCapacity: 10 }),
    /unsupported key: freeCapacity/u
  );
  const withNewCategory = structuredClone(allocationBudget());
  withNewCategory.maxCategoryBytes.generated = 1;
  assert.throws(() => validateCapacityBudget(withNewCategory), /category set mismatch/u);
});

test('capacity schema rejects unnamed ceiling increases', () => {
  const budget = allocationBudget();
  budget.maxTrackedBytes++;
  assert.throws(() => validateCapacityBudget(budget), /baseline plus named allocations/u);
});

test('capacity schema rejects duplicate allocation ids and overlapping paths', () => {
  const duplicateId = allocationBudget();
  duplicateId.allocations[1].id = duplicateId.allocations[0].id;
  assert.throws(() => validateCapacityBudget(duplicateId), /ids must be unique/u);

  const overlappingPath = allocationBudget();
  overlappingPath.allocations[1].writerPaths[0] = 'scripts/repo-size-budget.json';
  overlappingPath.allocations[1].maxPathBytesDelta = {
    'scripts/repo-size-budget.json': 20,
    'scripts/lean.test.mjs': 10,
  };
  assert.throws(() => validateCapacityBudget(overlappingPath), /writerPaths must be disjoint/u);
});

test('capacity schema rejects free file capacity and path padding', () => {
  const files = allocationBudget();
  files.allocations[1].maxTrackedFilesDelta = 1;
  assert.throws(() => validateCapacityBudget(files), /baseline plus named allocations/u);

  const padding = allocationBudget();
  padding.allocations[1].maxPathBytesDelta['scripts/lean.mjs'] = 21;
  assert.equal(validateCapacityBudget(padding), padding);
});
