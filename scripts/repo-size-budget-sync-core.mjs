import path from 'node:path';

const SOURCE_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.mjs', '.sh', '.ts', '.tsx']);
const TEXT_DOC_EXTENSIONS = new Set(['.md', '.txt']);
const CONFIG_DATA_EXTENSIONS = new Set(['.json', '.jsonl', '.toml', '.yaml', '.yml']);

export function readNonEmptyValue(arg, prefix) {
  const value = arg.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a non-empty value.`);
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function synchronizedBudget(report, previousBudget, budgetRelPath, previousText, included) {
  if (!included) return exactBudgetFromReport(report, previousBudget);

  let nextBudget = exactBudgetFromReport(report, previousBudget);
  const previousBytes = Buffer.byteLength(previousText);
  for (let attempt = 0; attempt < 20; attempt++) {
    const nextText = stableJson(nextBudget);
    const adjustedReport = withBudgetFileBytes(
      report,
      budgetRelPath,
      previousBytes,
      Buffer.byteLength(nextText)
    );
    const adjustedBudget = exactBudgetFromReport(adjustedReport, previousBudget);
    if (stableJson(adjustedBudget) === nextText) return adjustedBudget;
    nextBudget = adjustedBudget;
  }
  throw new Error('Repo size budget sync did not converge.');
}

function exactBudgetFromReport(report, previousBudget) {
  return {
    version: 1,
    maxTrackedBytes: report.tracked.total.bytes,
    maxTrackedFiles: report.tracked.total.files,
    maxCategoryBytes: Object.fromEntries(
      report.tracked.categories.map(category => [category.name, category.bytes])
    ),
    ...preservedKnownLargeLimits(previousBudget, report),
  };
}

function preservedKnownLargeLimits(previousBudget, report) {
  const largestFile = report.tracked.largestFiles[0]?.bytes ?? 1;
  const largestSource = report.tracked.sourceHotspots[0]?.lines ?? 1;
  return {
    maxLargestFileBytes: Math.max(largestFile, previousBudget.maxLargestFileBytes ?? 1),
    maxSourceOrTestLines: Math.max(largestSource, previousBudget.maxSourceOrTestLines ?? 1),
  };
}

function withBudgetFileBytes(report, relPath, fromBytes, toBytes) {
  const delta = toBytes - fromBytes;
  const categoryName = budgetCategory(relPath);
  return {
    ...report,
    tracked: {
      ...report.tracked,
      total: { ...report.tracked.total, bytes: report.tracked.total.bytes + delta },
      categories: report.tracked.categories.map(category =>
        category.name === categoryName ? { ...category, bytes: category.bytes + delta } : category
      ),
    },
  };
}

function budgetCategory(filePath) {
  const extension = path.extname(filePath);
  const base = path.basename(filePath);
  if (
    filePath.includes('/drizzle/') ||
    filePath.includes('/snapshots/visual/') ||
    filePath === 'pnpm-lock.yaml' ||
    filePath.startsWith('apps/web/public/icon-') ||
    filePath === 'docs/plans/current-tracker.md'
  ) {
    return 'large support/generated-ish';
  }
  if (/\.(test|spec)\.(js|mjs|ts|tsx)$/u.test(base) || filePath.includes('/e2e/')) {
    return 'tests/e2e';
  }
  if (SOURCE_EXTENSIONS.has(extension)) return 'source/scripts';
  if (TEXT_DOC_EXTENSIONS.has(extension)) return 'docs/text';
  if (CONFIG_DATA_EXTENSIONS.has(extension)) return 'config/data/messages';
  return 'other';
}
