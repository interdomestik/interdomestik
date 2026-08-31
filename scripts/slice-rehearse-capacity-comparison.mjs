const BUDGET_PATH = 'scripts/repo-size-budget.json';
const CAPACITY_REBASE_ID = 'capacity-rebase';

export function withoutDerivedCapacityFields(value, allocationId) {
  const normalized = structuredClone(value);
  normalized.allocations = normalized.allocations
    .filter(allocation => allocation.id !== allocationId)
    .map(allocation => {
      if (allocation.id !== CAPACITY_REBASE_ID || allocation.mode !== 'exact') return allocation;
      const budgetBytes = allocation.pathBytesDelta[BUDGET_PATH];
      allocation.pathBytesDelta[BUDGET_PATH] = 0;
      allocation.trackedBytesDelta -= budgetBytes;
      allocation.categoryBytesDelta['config/data/messages'] -= budgetBytes;
      return allocation;
    });
  normalized.maxTrackedBytes = 0;
  normalized.maxTrackedFiles = 0;
  normalized.maxCategoryBytes = {};
  return normalized;
}
