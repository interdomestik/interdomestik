import { deriveCapacityFixedPoint } from './slice-rehearse-capacity-fixed-point.mjs';
import { compareText, must } from './slice-rehearse-canonical.mjs';

const BUDGET_PATH = 'scripts/repo-size-budget.json';

export function extendBoundedAllocation(existing, proposed, categoriesByPath, writerDeltas = {}) {
  must(
    existing.mode === 'bounded' && proposed.mode === 'bounded' && existing.id === proposed.id,
    'capacity owner extension requires one bounded identity'
  );
  const maxPathBytesDelta = { ...existing.maxPathBytesDelta };
  const maxCategoryBytesDelta = { ...existing.maxCategoryBytesDelta };
  let maxTrackedBytesDelta = existing.maxTrackedBytesDelta;
  let maxTrackedFilesDelta = existing.maxTrackedFilesDelta;
  for (const path of proposed.writerPaths) {
    const previous = maxPathBytesDelta[path] ?? 0;
    const next = Math.max(previous, proposed.maxPathBytesDelta[path]);
    const increase = next - previous;
    maxPathBytesDelta[path] = next;
    maxTrackedBytesDelta += increase;
    const category = categoriesByPath[path];
    must(
      typeof category === 'string' && category.length > 0,
      `writer category is missing: ${path}`
    );
    maxCategoryBytesDelta[category] = (maxCategoryBytesDelta[category] ?? 0) + increase;
    if (
      !existing.writerPaths.includes(path) &&
      writerDeltas[path]?.capacityBaselineExists === false
    ) {
      maxTrackedFilesDelta += 1;
    }
  }
  return {
    id: existing.id,
    mode: 'bounded',
    writerPaths: [...new Set([...existing.writerPaths, ...proposed.writerPaths])].sort(compareText),
    maxTrackedBytesDelta,
    maxTrackedFilesDelta,
    maxCategoryBytesDelta,
    maxPathBytesDelta: Object.fromEntries(
      Object.entries(maxPathBytesDelta).sort(([left], [right]) => compareText(left, right))
    ),
  };
}

export function deriveOwnerExtension({
  budget,
  existing,
  proposed,
  manifest,
  writerDeltas,
  baselineBudgetBytes,
}) {
  must(
    manifest.writerPaths.some(path => existing.writerPaths.includes(path)),
    'capacity owner extension requires an existing owned writer'
  );
  must(
    manifest.writerPaths.includes(BUDGET_PATH),
    'capacity owner extension requires the budget writer'
  );
  const categories = Object.fromEntries(manifest.pathPlans.map(plan => [plan.path, plan.category]));
  return deriveCapacityFixedPoint({
    budget,
    allocation: extendBoundedAllocation(existing, proposed, categories, writerDeltas),
    baselineBudgetBytes,
    replaceExisting: true,
  });
}
