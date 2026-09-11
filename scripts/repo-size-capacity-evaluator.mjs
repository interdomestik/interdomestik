import { budgetCategory } from './repo-size-budget-sync-core.mjs';
import { CAPACITY_CATEGORIES, validateCapacityBudget } from './repo-size-capacity-schema.mjs';
import { isSemanticGovernanceDocument } from './modularity-guard-policy.mjs';

function addOver(violations, code, actual, limit, label = code, details = {}) {
  if (actual > limit) violations.push({ code, actual, limit, label, ...details });
}

function semanticGrowth(facts, category = null) {
  const signedGrowth = [...facts.values()]
    .filter(
      fact =>
        isSemanticGovernanceDocument(fact.path) &&
        (category === null || budgetCategory(fact.path) === category)
    )
    .reduce((sum, fact) => sum + fact.bytesDelta, 0);
  return Math.max(0, signedGrowth);
}

export function allocatedSemanticBytes(allocation, category = null) {
  const pathBytes = allocation.pathBytesDelta ?? allocation.maxPathBytesDelta;
  return allocation.writerPaths
    .filter(
      path =>
        isSemanticGovernanceDocument(path) &&
        (category === null || budgetCategory(path) === category)
    )
    .reduce((sum, path) => sum + pathBytes[path], 0);
}

function globalViolations(report, budget, facts) {
  const violations = [];
  addOver(
    violations,
    'tracked-bytes',
    report.tracked.total.bytes,
    budget.maxTrackedBytes + semanticGrowth(facts)
  );
  addOver(violations, 'tracked-files', report.tracked.total.files, budget.maxTrackedFiles);
  if (!Object.hasOwn(report.tracked, 'largestCapacityFile')) {
    violations.push({
      code: 'inventory-attribution:largest-capacity-file',
      actual: 1,
      limit: 0,
      label: 'Untruncated largest capacity file fact is required',
    });
  }
  const largest = report.tracked.largestCapacityFile;
  if (largest)
    addOver(
      violations,
      'largest-file-bytes',
      largest.bytes,
      budget.maxLargestFileBytes,
      'largest-file-bytes',
      { path: largest.path }
    );
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
      budget.maxCategoryBytes[category] + semanticGrowth(facts, category)
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
    if (isSemanticGovernanceDocument(fact.path)) continue;
    const expected = allocation.pathBytesDelta[fact.path];
    if (fact.bytesDelta !== expected)
      violations.push({
        code: `allocation-path-bytes:${allocation.id}:${fact.path}`,
        actual: fact.bytesDelta,
        limit: expected,
        label: `Exact allocation path delta (${fact.path})`,
      });
  }
  const capacityFacts = facts.filter(fact => !isSemanticGovernanceDocument(fact.path));
  const bytes = capacityFacts.reduce((sum, fact) => sum + fact.bytesDelta, 0);
  const files = facts.reduce((sum, fact) => sum + fact.filesDelta, 0);
  const expectedBytes =
    allocation.trackedBytesDelta -
    allocation.writerPaths
      .filter(isSemanticGovernanceDocument)
      .reduce((sum, path) => sum + allocation.pathBytesDelta[path], 0);
  if (bytes !== expectedBytes)
    violations.push({
      code: `allocation-bytes:${allocation.id}`,
      actual: bytes,
      limit: expectedBytes,
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
    const actual = capacityFacts
      .filter(fact => budgetCategory(fact.path) === category)
      .reduce((sum, fact) => sum + fact.bytesDelta, 0);
    const semanticExpected = allocation.writerPaths
      .filter(path => isSemanticGovernanceDocument(path) && budgetCategory(path) === category)
      .reduce((sum, path) => sum + allocation.pathBytesDelta[path], 0);
    const expected = (allocation.categoryBytesDelta[category] ?? 0) - semanticExpected;
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
    const bytes = isSemanticGovernanceDocument(fact.path) ? 0 : Math.max(0, fact.bytesDelta);
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
    allocation.maxTrackedBytesDelta - allocatedSemanticBytes(allocation)
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
      (allocation.maxCategoryBytesDelta[category] ?? 0) -
        allocatedSemanticBytes(allocation, category)
    );
}

export function evaluateCapacityBudget(report, budget, changeFacts) {
  validateCapacityBudget(budget);
  const facts = new Map();
  for (const fact of changeFacts) {
    if (facts.has(fact.path)) throw new Error(`duplicate repo-size change fact: ${fact.path}`);
    facts.set(fact.path, fact);
  }
  const violations = globalViolations(report, budget, facts);
  addInventoryViolations(violations, report, budget, facts);
  const owners = new Map(
    budget.allocations.flatMap(item => item.writerPaths.map(filePath => [filePath, item]))
  );
  for (const fact of facts.values()) {
    if (owners.has(fact.path)) continue;
    addOver(
      violations,
      `unallocated-growth:bytes:${fact.path}`,
      fact.bytesDelta,
      0,
      `Unallocated byte growth (${fact.path})`
    );
    addOver(
      violations,
      `unallocated-growth:files:${fact.path}`,
      fact.filesDelta,
      0,
      `Unallocated file growth (${fact.path})`
    );
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
