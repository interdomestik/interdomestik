import { createHash } from 'node:crypto';

import {
  allocationDelta,
  CAPACITY_CATEGORIES,
  categoryAllocationDelta,
  validateCapacityBudget,
} from './repo-size-capacity-schema.mjs';

const BUDGET_PATH = 'scripts/repo-size-budget.json';
const CAPACITY_REBASE_ID = 'capacity-rebase';

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function deriveCeilings(value) {
  const total = key =>
    value.allocations.reduce((sum, allocation) => sum + allocationDelta(allocation, key), 0);
  value.maxTrackedBytes =
    value.baseline.trackedBytes + value.reserve.trackedBytes + total('trackedBytesDelta');
  value.maxTrackedFiles =
    value.baseline.trackedFiles + value.reserve.trackedFiles + total('trackedFilesDelta');
  value.maxCategoryBytes = Object.fromEntries(
    CAPACITY_CATEGORIES.map(category => [
      category,
      value.baseline.categoryBytes[category] +
        (value.reserve.categoryBytes[category] ?? 0) +
        value.allocations.reduce(
          (sum, allocation) => sum + categoryAllocationDelta(allocation, category),
          0
        ),
    ])
  );
}

function updateBudgetSelfSize(value, delta) {
  const allocation = value.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  if (allocation?.mode !== 'exact' || !allocation.writerPaths.includes(BUDGET_PATH)) {
    throw new Error('capacity-rebase exact budget-path allocation is required');
  }
  const previous = allocation.pathBytesDelta[BUDGET_PATH];
  const adjustment = delta - previous;
  allocation.pathBytesDelta[BUDGET_PATH] = delta;
  allocation.trackedBytesDelta += adjustment;
  allocation.categoryBytesDelta['config/data/messages'] += adjustment;
}

function candidateAt(budget, allocation, selfBytesDelta) {
  const candidate = structuredClone(budget);
  updateBudgetSelfSize(candidate, selfBytesDelta);
  candidate.allocations.push(structuredClone(allocation));
  deriveCeilings(candidate);
  validateCapacityBudget(candidate);
  const budgetBytes = canonicalJson(candidate);
  return { candidate, budgetBytes };
}

function result(candidate, budgetBytes, selfBytesDelta, authorityStops = []) {
  return {
    mode: authorityStops.length ? 'blocked' : 'derived',
    allocation: candidate.allocations.at(-1),
    budget: candidate,
    budgetBytes,
    sha256: createHash('sha256').update(budgetBytes).digest('hex'),
    selfBytesDelta,
    authorityStops,
  };
}

export function deriveCapacityFixedPoint({ budget, allocation, baselineBudgetBytes }) {
  const original = budget.allocations.find(item => item.id === CAPACITY_REBASE_ID);
  let selfBytesDelta = original.pathBytesDelta[BUDGET_PATH];
  const observed = new Set();
  for (let iteration = 1; iteration <= 64; iteration += 1) {
    observed.add(selfBytesDelta);
    const { candidate, budgetBytes } = candidateAt(budget, allocation, selfBytesDelta);
    const nextDelta = Buffer.byteLength(budgetBytes) - baselineBudgetBytes;
    if (nextDelta < 0) throw new Error('derived budget self-size is negative');
    if (nextDelta === selfBytesDelta) return result(candidate, budgetBytes, selfBytesDelta);
    if (observed.has(nextDelta)) break;
    observed.add(nextDelta);
    selfBytesDelta = nextDelta;
  }
  let upperBound = Math.max(...observed);
  let upper = candidateAt(budget, allocation, upperBound);
  let observedDelta = Buffer.byteLength(upper.budgetBytes) - baselineBudgetBytes;
  for (let iteration = 0; observedDelta > upperBound && iteration < 64; iteration += 1) {
    upperBound = observedDelta;
    upper = candidateAt(budget, allocation, upperBound);
    observedDelta = Buffer.byteLength(upper.budgetBytes) - baselineBudgetBytes;
  }
  return result(upper.candidate, upper.budgetBytes, upperBound, [
    {
      code: 'capacity:fixed-point-upper-bound',
      upperBound,
      observedDelta,
      coveredBy: 'derived_capacity_rebind',
    },
  ]);
}
