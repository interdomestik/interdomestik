import { budgetCategory } from './repo-size-budget-sync-core.mjs';
import { CAPACITY_CATEGORIES, validateCapacityBudget } from './repo-size-capacity-schema.mjs';

function addOver(violations, code, actual, limit, label = code) {
  if (actual > limit) violations.push({ code, actual, limit, label });
}

function globalViolations(report, budget) {
  const violations = [];
  addOver(violations, 'tracked-bytes', report.tracked.total.bytes, budget.maxTrackedBytes);
  addOver(violations, 'tracked-files', report.tracked.total.files, budget.maxTrackedFiles);
  const largest = report.tracked.largestFiles[0];
  if (largest) addOver(violations, 'largest-file-bytes', largest.bytes, budget.maxLargestFileBytes);
  const hotspot = report.tracked.sourceHotspots[0];
  if (hotspot)
    addOver(violations, 'source-or-test-lines', hotspot.lines, budget.maxSourceOrTestLines);
  const categories = new Map(report.tracked.categories.map(item => [item.name, item.bytes]));
  for (const category of categories.keys()) {
    if (!CAPACITY_CATEGORIES.includes(category))
      addOver(
        violations,
        `category-budget-missing:${category}`,
        categories.get(category),
        0,
        category
      );
  }
  for (const category of CAPACITY_CATEGORIES)
    addOver(
      violations,
      `category:${category}`,
      categories.get(category) ?? 0,
      budget.maxCategoryBytes[category]
    );
  return violations;
}

function addInventoryViolations(violations, report, budget, facts) {
  const values = [...facts.values()];
  const expectedBytes =
    budget.baseline.trackedBytes + values.reduce((sum, fact) => sum + fact.bytesDelta, 0);
  const expectedFiles =
    budget.baseline.trackedFiles + values.reduce((sum, fact) => sum + fact.filesDelta, 0);
  if (report.tracked.total.bytes !== expectedBytes)
    violations.push({
      code: 'inventory-attribution:tracked-bytes',
      actual: report.tracked.total.bytes,
      limit: expectedBytes,
      label: 'Physical tracked bytes must equal baseline plus Git-attributed deltas',
    });
  if (report.tracked.total.files !== expectedFiles)
    violations.push({
      code: 'inventory-attribution:tracked-files',
      actual: report.tracked.total.files,
      limit: expectedFiles,
      label: 'Physical tracked files must equal baseline plus Git-attributed deltas',
    });
  const reported = new Map(report.tracked.categories.map(item => [item.name, item.bytes]));
  for (const category of CAPACITY_CATEGORIES) {
    const delta = values
      .filter(fact => budgetCategory(fact.path) === category)
      .reduce((sum, fact) => sum + fact.bytesDelta, 0);
    const expected = budget.baseline.categoryBytes[category] + delta;
    if ((reported.get(category) ?? 0) !== expected)
      violations.push({
        code: `inventory-attribution:category:${category}`,
        actual: reported.get(category) ?? 0,
        limit: expected,
        label: `Physical category bytes must be Git-attributed (${category})`,
      });
  }
}

function addExactViolations(violations, allocation, facts) {
  for (const fact of facts) {
    const expected = allocation.pathBytesDelta[fact.path];
    if (fact.bytesDelta !== expected)
      violations.push({
        code: `allocation-path-bytes:${allocation.id}:${fact.path}`,
        actual: fact.bytesDelta,
        limit: expected,
        label: `Exact allocation path delta (${fact.path})`,
      });
  }
  const bytes = facts.reduce((sum, fact) => sum + fact.bytesDelta, 0);
  const files = facts.reduce((sum, fact) => sum + fact.filesDelta, 0);
  if (bytes !== allocation.trackedBytesDelta)
    violations.push({
      code: `allocation-bytes:${allocation.id}`,
      actual: bytes,
      limit: allocation.trackedBytesDelta,
      label: allocation.id,
    });
  if (files !== allocation.trackedFilesDelta)
    violations.push({
      code: `allocation-files:${allocation.id}`,
      actual: files,
      limit: allocation.trackedFilesDelta,
      label: allocation.id,
    });
  for (const category of CAPACITY_CATEGORIES) {
    const actual = facts
      .filter(fact => budgetCategory(fact.path) === category)
      .reduce((sum, fact) => sum + fact.bytesDelta, 0);
    const expected = allocation.categoryBytesDelta[category] ?? 0;
    if (actual !== expected)
      violations.push({
        code: `allocation-category:${allocation.id}:${category}`,
        actual,
        limit: expected,
        label: allocation.id,
      });
  }
}

function addBoundedViolations(violations, allocation, facts) {
  let positiveBytes = 0;
  let positiveFiles = 0;
  const categories = new Map();
  for (const fact of facts) {
    const bytes = Math.max(0, fact.bytesDelta);
    const category = budgetCategory(fact.path);
    positiveBytes += bytes;
    positiveFiles += Math.max(0, fact.filesDelta);
    categories.set(category, (categories.get(category) ?? 0) + bytes);
    addOver(
      violations,
      `allocation-path-bytes:${allocation.id}:${fact.path}`,
      bytes,
      allocation.maxPathBytesDelta[fact.path]
    );
  }
  addOver(
    violations,
    `allocation-bytes:${allocation.id}`,
    positiveBytes,
    allocation.maxTrackedBytesDelta
  );
  addOver(
    violations,
    `allocation-files:${allocation.id}`,
    positiveFiles,
    allocation.maxTrackedFilesDelta
  );
  for (const category of CAPACITY_CATEGORIES)
    addOver(
      violations,
      `allocation-category:${allocation.id}:${category}`,
      categories.get(category) ?? 0,
      allocation.maxCategoryBytesDelta[category] ?? 0
    );
}

export function evaluateCapacityBudget(report, budget, changeFacts) {
  validateCapacityBudget(budget);
  const violations = globalViolations(report, budget);
  const facts = new Map();
  for (const fact of changeFacts) {
    if (facts.has(fact.path)) throw new Error(`duplicate repo-size change fact: ${fact.path}`);
    facts.set(fact.path, fact);
  }
  addInventoryViolations(violations, report, budget, facts);
  const owners = new Map(
    budget.allocations.flatMap(item => item.writerPaths.map(filePath => [filePath, item]))
  );
  for (const fact of facts.values()) {
    if (fact.bytesDelta > 0 && !owners.has(fact.path))
      violations.push({
        code: `unallocated-growth:${fact.path}`,
        actual: fact.bytesDelta,
        limit: 0,
        label: `Unallocated growth (${fact.path})`,
      });
  }
  for (const allocation of budget.allocations) {
    const owned = allocation.writerPaths.map(
      filePath => facts.get(filePath) ?? { path: filePath, bytesDelta: 0, filesDelta: 0 }
    );
    if (allocation.mode === 'exact') addExactViolations(violations, allocation, owned);
    else addBoundedViolations(violations, allocation, owned);
  }
  return { passed: violations.length === 0, violations };
}
