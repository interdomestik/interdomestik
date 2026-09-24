// Ordinary delivery reports growth without requiring historical path allocations.
// Explicit legacy runners retain the strict capacity evaluator.
export function evaluateOrdinaryBudget(report, budget) {
  const violations = [];
  const advisories = [];
  const addOver = (items, code, actual, limit, details = {}) => {
    if (actual > limit) items.push({ code, actual, limit, label: code, ...details });
  };

  if (!Object.hasOwn(report.tracked, 'largestCapacityFile')) {
    violations.push({
      code: 'inventory-attribution:largest-capacity-file',
      actual: 1,
      limit: 0,
      label: 'Untruncated largest capacity file fact is required',
    });
  }
  const largest = report.tracked.largestCapacityFile;
  if (largest) {
    addOver(violations, 'largest-file-bytes', largest.bytes, budget.maxLargestFileBytes, {
      path: largest.path,
      label: largest.path,
    });
  }

  addOver(advisories, 'tracked-bytes', report.tracked.total.bytes, budget.maxTrackedBytes);
  addOver(advisories, 'tracked-files', report.tracked.total.files, budget.maxTrackedFiles);
  const hotspot = report.tracked.sourceHotspots[0];
  if (hotspot) {
    addOver(advisories, 'source-or-test-lines', hotspot.lines, budget.maxSourceOrTestLines, {
      path: hotspot.path,
      label: hotspot.path,
    });
  }
  for (const category of report.tracked.categories) {
    addOver(
      advisories,
      `category:${category.name}`,
      category.bytes,
      budget.maxCategoryBytes[category.name] ?? 0
    );
  }
  return { passed: violations.length === 0, violations, advisories };
}
