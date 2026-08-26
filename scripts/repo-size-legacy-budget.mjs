function addViolation(violations, code, actual, limit, label) {
  if (actual > limit) violations.push({ code, label, actual, limit });
}

export function validateLegacyBudget(budget, budgetPath) {
  if (!budget || typeof budget !== 'object') {
    throw new Error(`Repo size budget must be a JSON object: ${budgetPath}`);
  }
  const allowed = new Set([
    'version',
    'maxTrackedBytes',
    'maxTrackedFiles',
    'maxLargestFileBytes',
    'maxSourceOrTestLines',
    'maxCategoryBytes',
  ]);
  for (const key of Object.keys(budget)) {
    if (!allowed.has(key)) throw new Error(`Repo size budget includes unsupported key: ${key}`);
  }
  if (budget.version !== 1) {
    throw new Error(`Unsupported repo size budget version in ${budgetPath}: ${budget.version}`);
  }
  for (const key of [...allowed].filter(
    key => key.startsWith('max') && key !== 'maxCategoryBytes'
  )) {
    if (!Number.isInteger(budget[key]) || budget[key] <= 0) {
      throw new Error(`Repo size budget ${key} must be a positive integer.`);
    }
  }
  if (!budget.maxCategoryBytes || typeof budget.maxCategoryBytes !== 'object') {
    throw new Error('Repo size budget maxCategoryBytes must be an object.');
  }
  for (const [category, value] of Object.entries(budget.maxCategoryBytes)) {
    if (!category || !Number.isInteger(value) || value <= 0) {
      throw new Error(`Repo size budget category limit is invalid: ${category}`);
    }
  }
}

export function evaluateLegacyBudget(report, budget) {
  const violations = [];
  const largest = report.tracked.largestFiles[0];
  const hotspot = report.tracked.sourceHotspots[0];
  addViolation(
    violations,
    'tracked-bytes',
    report.tracked.total.bytes,
    budget.maxTrackedBytes,
    'Tracked repo size'
  );
  addViolation(
    violations,
    'tracked-files',
    report.tracked.total.files,
    budget.maxTrackedFiles,
    'Tracked file count'
  );
  if (largest)
    addViolation(
      violations,
      'largest-file-bytes',
      largest.bytes,
      budget.maxLargestFileBytes,
      `Largest tracked file (${largest.path})`
    );
  if (hotspot)
    addViolation(
      violations,
      'source-or-test-lines',
      hotspot.lines,
      budget.maxSourceOrTestLines,
      `Largest source/test file (${hotspot.path})`
    );
  for (const category of report.tracked.categories) {
    const limit = budget.maxCategoryBytes[category.name];
    if (!limit)
      violations.push({
        code: `category-budget-missing:${category.name}`,
        label: `Tracked category "${category.name}"`,
        actual: category.bytes,
        limit: 0,
      });
    else
      addViolation(
        violations,
        `category:${category.name}`,
        category.bytes,
        limit,
        `Tracked category "${category.name}"`
      );
  }
  return { passed: violations.length === 0, violations };
}

export function sanitizeLegacyBudget(budget) {
  return {
    version: budget.version,
    maxTrackedBytes: budget.maxTrackedBytes,
    maxTrackedFiles: budget.maxTrackedFiles,
    maxLargestFileBytes: budget.maxLargestFileBytes,
    maxSourceOrTestLines: budget.maxSourceOrTestLines,
    maxCategoryBytes: { ...budget.maxCategoryBytes },
  };
}
