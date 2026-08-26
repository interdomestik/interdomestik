import path from 'node:path';

export const CAPACITY_CATEGORIES = Object.freeze([
  'config/data/messages',
  'docs/text',
  'large support/generated-ish',
  'other',
  'source/scripts',
  'tests/e2e',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertKeys(value, allowed, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`${label} includes unsupported key: ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) throw new Error(`${label} is missing key: ${key}`);
  }
}

function assertInteger(value, label, { positive = false, nonNegative = false } = {}) {
  const valid =
    Number.isSafeInteger(value) && (!positive || value > 0) && (!nonNegative || value >= 0);
  if (!valid) throw new Error(`${label} must be ${positive ? 'a positive' : 'an'} integer.`);
}

function sortedStrings(values) {
  return values.sort((left, right) => left.localeCompare(right));
}

function assertCategoryMap(value, label, { exact = false, nonNegative = true } = {}) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const keys = sortedStrings(Object.keys(value));
  if (exact && JSON.stringify(keys) !== JSON.stringify(sortedStrings([...CAPACITY_CATEGORIES]))) {
    throw new Error(`${label} category set mismatch.`);
  }
  for (const [category, bytes] of Object.entries(value)) {
    if (!CAPACITY_CATEGORIES.includes(category)) {
      throw new Error(`${label} category set mismatch: ${category}`);
    }
    assertInteger(bytes, `${label}.${category}`, { nonNegative });
  }
}

function assertPathMap(value, writerPaths, label, nonNegative) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  if (
    JSON.stringify(sortedStrings(Object.keys(value))) !==
    JSON.stringify(sortedStrings([...writerPaths]))
  ) {
    throw new Error(`${label} path set must equal writerPaths.`);
  }
  for (const [filePath, bytes] of Object.entries(value)) {
    assertInteger(bytes, `${label}.${filePath}`, { nonNegative });
  }
}

function allocationKeys(mode) {
  return mode === 'exact'
    ? [
        'id',
        'mode',
        'writerPaths',
        'trackedBytesDelta',
        'trackedFilesDelta',
        'categoryBytesDelta',
        'pathBytesDelta',
      ]
    : [
        'id',
        'mode',
        'writerPaths',
        'maxTrackedBytesDelta',
        'maxTrackedFilesDelta',
        'maxCategoryBytesDelta',
        'maxPathBytesDelta',
      ];
}

function validateWriterPaths(allocation) {
  const paths = allocation.writerPaths;
  const invalid =
    !Array.isArray(paths) ||
    paths.length === 0 ||
    new Set(paths).size !== paths.length ||
    paths.some(
      filePath =>
        typeof filePath !== 'string' ||
        !filePath ||
        path.isAbsolute(filePath) ||
        filePath.split('/').some(segment => !segment || segment === '.' || segment === '..')
    );
  if (invalid) throw new Error(`allocation ${allocation.id} writerPaths mismatch.`);
}

function validateAllocation(allocation) {
  const exact = allocation?.mode === 'exact';
  if (!exact && allocation?.mode !== 'bounded') throw new Error('allocation mode mismatch.');
  assertKeys(
    allocation,
    allocationKeys(allocation.mode),
    `allocation ${allocation?.id ?? '<unknown>'}`
  );
  if (!/^[a-z][a-z0-9-]+$/u.test(allocation.id)) throw new Error('allocation id mismatch.');
  validateWriterPaths(allocation);
  const bytesKey = exact ? 'trackedBytesDelta' : 'maxTrackedBytesDelta';
  const filesKey = exact ? 'trackedFilesDelta' : 'maxTrackedFilesDelta';
  const categoriesKey = exact ? 'categoryBytesDelta' : 'maxCategoryBytesDelta';
  const pathsKey = exact ? 'pathBytesDelta' : 'maxPathBytesDelta';
  assertInteger(allocation[bytesKey], `${allocation.id}.${bytesKey}`, { nonNegative: !exact });
  assertInteger(allocation[filesKey], `${allocation.id}.${filesKey}`, { nonNegative: !exact });
  assertCategoryMap(allocation[categoriesKey], `${allocation.id}.${categoriesKey}`, {
    nonNegative: !exact,
  });
  assertPathMap(
    allocation[pathsKey],
    allocation.writerPaths,
    `${allocation.id}.${pathsKey}`,
    !exact
  );
  const categoryTotal = Object.values(allocation[categoriesKey]).reduce((sum, n) => sum + n, 0);
  const pathTotal = Object.values(allocation[pathsKey]).reduce((sum, n) => sum + n, 0);
  if (categoryTotal !== allocation[bytesKey] || (exact && pathTotal !== allocation[bytesKey])) {
    throw new Error(
      `allocation ${allocation.id} ${exact ? 'exact byte totals' : 'bounded category totals'} disagree.`
    );
  }
}

export function allocationDelta(allocation, key) {
  return allocation.mode === 'exact'
    ? allocation[key]
    : allocation[`max${key[0].toUpperCase()}${key.slice(1)}`];
}

export function categoryAllocationDelta(allocation, category) {
  const key = allocation.mode === 'exact' ? 'categoryBytesDelta' : 'maxCategoryBytesDelta';
  return allocation[key][category] ?? 0;
}

export function validateCapacityBudget(budget) {
  assertKeys(
    budget,
    [
      'version',
      'baseline',
      'allocations',
      'reserve',
      'maxTrackedBytes',
      'maxTrackedFiles',
      'maxCategoryBytes',
      'maxLargestFileBytes',
      'maxSourceOrTestLines',
    ],
    'Repo size budget'
  );
  if (budget.version !== 2)
    throw new Error(`Unsupported repo size budget version: ${budget.version}`);
  assertKeys(
    budget.baseline,
    ['protectedMainSha', 'trackedBytes', 'trackedFiles', 'categoryBytes'],
    'budget baseline'
  );
  if (!/^[a-f0-9]{40}$/u.test(budget.baseline.protectedMainSha))
    throw new Error('budget baseline protectedMainSha mismatch.');
  assertInteger(budget.baseline.trackedBytes, 'baseline.trackedBytes', { positive: true });
  assertInteger(budget.baseline.trackedFiles, 'baseline.trackedFiles', { positive: true });
  assertCategoryMap(budget.baseline.categoryBytes, 'baseline.categoryBytes', { exact: true });
  if (
    Object.values(budget.baseline.categoryBytes).reduce((sum, n) => sum + n, 0) !==
    budget.baseline.trackedBytes
  )
    throw new Error('baseline category totals disagree.');
  if (!Array.isArray(budget.allocations) || budget.allocations.length === 0)
    throw new Error('budget allocations must be a non-empty array.');
  budget.allocations.forEach(validateAllocation);
  const ids = budget.allocations.map(item => item.id);
  if (new Set(ids).size !== ids.length) throw new Error('allocation ids must be unique.');
  const paths = budget.allocations.flatMap(item => item.writerPaths);
  if (new Set(paths).size !== paths.length)
    throw new Error('allocation writerPaths must be disjoint.');
  assertKeys(
    budget.reserve,
    ['trackedBytes', 'trackedFiles', 'categoryBytes', 'rationale'],
    'reserve'
  );
  assertInteger(budget.reserve.trackedBytes, 'reserve.trackedBytes', { nonNegative: true });
  assertInteger(budget.reserve.trackedFiles, 'reserve.trackedFiles', { nonNegative: true });
  assertCategoryMap(budget.reserve.categoryBytes, 'reserve.categoryBytes');
  if (
    Object.values(budget.reserve.categoryBytes).reduce((sum, n) => sum + n, 0) !==
    budget.reserve.trackedBytes
  )
    throw new Error('reserve category totals disagree.');
  if (typeof budget.reserve.rationale !== 'string' || budget.reserve.rationale.length < 20)
    throw new Error('reserve rationale must be explicit.');
  for (const key of [
    'maxTrackedBytes',
    'maxTrackedFiles',
    'maxLargestFileBytes',
    'maxSourceOrTestLines',
  ])
    assertInteger(budget[key], key, { positive: true });
  assertCategoryMap(budget.maxCategoryBytes, 'maxCategoryBytes', { exact: true });
  validateDerivedCeilings(budget);
  return budget;
}

function validateDerivedCeilings(budget) {
  const derive = key =>
    budget.allocations.reduce((sum, item) => sum + allocationDelta(item, key), 0);
  const bytes =
    budget.baseline.trackedBytes + budget.reserve.trackedBytes + derive('trackedBytesDelta');
  const files =
    budget.baseline.trackedFiles + budget.reserve.trackedFiles + derive('trackedFilesDelta');
  if (budget.maxTrackedBytes !== bytes || budget.maxTrackedFiles !== files)
    throw new Error(
      'budget aggregate ceiling does not equal baseline plus named allocations and reserve.'
    );
  for (const category of CAPACITY_CATEGORIES) {
    const derived =
      budget.baseline.categoryBytes[category] +
      (budget.reserve.categoryBytes[category] ?? 0) +
      budget.allocations.reduce((sum, item) => sum + categoryAllocationDelta(item, category), 0);
    if (budget.maxCategoryBytes[category] !== derived)
      throw new Error(`budget category ceiling is not derived: ${category}`);
  }
  if (
    Object.values(budget.maxCategoryBytes).reduce((sum, n) => sum + n, 0) !== budget.maxTrackedBytes
  )
    throw new Error('aggregate category ceilings disagree with maxTrackedBytes.');
}
