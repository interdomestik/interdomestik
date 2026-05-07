#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BUDGET_PATH = 'scripts/repo-size-budget.json';
const SOURCE_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.mjs', '.sh', '.ts', '.tsx']);
const TEXT_DOC_EXTENSIONS = new Set(['.md', '.txt']);
const CONFIG_DATA_EXTENSIONS = new Set(['.json', '.jsonl', '.toml', '.yaml', '.yml']);
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const GIT_BIN = '/usr/bin/git';
const DU_BIN = '/usr/bin/du';
const repoRoot = getRepoRoot();
const LOCAL_DISK_TARGETS = [
  '.git',
  'node_modules',
  'apps/web/.next',
  'apps/web/node_modules',
  'apps/web/playwright-report',
  'apps/web/test-results',
  'packages/database/drizzle',
  'apps/web/e2e/snapshots',
];

function parseArgs(argv) {
  const options = {
    json: false,
    check: false,
    budgetPath: DEFAULT_BUDGET_PATH,
    top: 20,
    minLines: 500,
    includeDisk: true,
    includeUntracked: false,
  };

  for (const arg of argv) {
    if (arg === '--') {
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--check') {
      options.check = true;
      options.includeDisk = false;
      continue;
    }

    if (arg === '--no-disk') {
      options.includeDisk = false;
      continue;
    }

    if (arg === '--include-untracked') {
      options.includeUntracked = true;
      continue;
    }

    if (arg.startsWith('--budget=')) {
      options.budgetPath = readNonEmptyValue(arg, '--budget=');
      continue;
    }

    if (arg.startsWith('--top=')) {
      options.top = readPositiveInteger(arg, '--top=');
      continue;
    }

    if (arg.startsWith('--min-lines=')) {
      options.minLines = readNonNegativeInteger(arg, '--min-lines=');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(`Usage: node scripts/repo-size-audit.mjs [options]

Options:
  --json               Print machine-readable JSON
  --check              Validate tracked repo size against the budget file
  --budget=<path>      Budget file for --check (default: ${DEFAULT_BUDGET_PATH})
  --top=<count>        Number of ranked entries to print (default: 20)
  --min-lines=<lines>  Source/test line threshold for hotspot list (default: 500)
  --no-disk            Skip local disk artifact sizes
  --include-untracked  Include untracked, non-ignored files in the inventory report
  --help, -h           Show this message
`);
}

function getRepoRoot() {
  return execFileSync(GIT_BIN, ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: SAFE_EXEC_ENV,
  }).trim(); // NOSONAR - GIT_BIN is absolute and SAFE_EXEC_ENV pins PATH to system directories.
}

function readNonEmptyValue(arg, prefix) {
  const value = arg.slice(prefix.length).trim();
  if (!value) {
    throw new Error(`${prefix.slice(0, -1)} requires a non-empty value.`);
  }
  return value;
}

function readPositiveInteger(arg, prefix) {
  const value = Number(arg.slice(prefix.length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${prefix.slice(0, -1)} must be a positive integer.`);
  }
  return value;
}

function readNonNegativeInteger(arg, prefix) {
  const value = Number(arg.slice(prefix.length));
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${prefix.slice(0, -1)} must be a non-negative integer.`);
  }
  return value;
}

function compareByBytesDesc(left, right) {
  return right.bytes - left.bytes || left.path.localeCompare(right.path);
}

function compareByLinesDesc(left, right) {
  return right.lines - left.lines || left.path.localeCompare(right.path);
}

function compareNamedBytesDesc(left, right) {
  return right.bytes - left.bytes || left.name.localeCompare(right.name);
}

function getTrackedFiles(options) {
  const args = ['ls-files', '-z', '--cached'];
  if (options.includeUntracked) {
    args.push('--others', '--exclude-standard');
  }

  const output = execFileSync(GIT_BIN, args, {
    cwd: repoRoot,
    encoding: 'buffer',
    env: SAFE_EXEC_ENV,
  }); // NOSONAR - GIT_BIN is absolute and SAFE_EXEC_ENV pins PATH to system directories.

  return [...new Set(output.toString('utf8').split('\0').filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function categorizeTrackedFile(filePath) {
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

  if (SOURCE_EXTENSIONS.has(extension)) {
    return 'source/scripts';
  }

  if (TEXT_DOC_EXTENSIONS.has(extension)) {
    return 'docs/text';
  }

  if (CONFIG_DATA_EXTENSIONS.has(extension)) {
    return 'config/data/messages';
  }

  return 'other';
}

function topLevelBucket(filePath) {
  const parts = filePath.split('/');
  if ((parts[0] === 'apps' || parts[0] === 'packages') && parts[1]) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0];
}

function isSourceOrTest(filePath) {
  const extension = path.extname(filePath);
  return SOURCE_EXTENSIONS.has(extension) && !filePath.endsWith('.d.ts');
}

function lineCountForFile(absPath) {
  const text = fs.readFileSync(absPath, 'utf8');
  if (text.length === 0) return 0;
  const newlineCount = text.match(/\n/gu)?.length ?? 0;
  return text.endsWith('\n') ? newlineCount : newlineCount + 1;
}

function formatBytes(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return unitIndex === 0
    ? `${value} ${units[unitIndex]}`
    : `${value.toFixed(2)} ${units[unitIndex]}`;
}

function addStat(bucket, key, bytes) {
  const existing = bucket.get(key) ?? { name: key, files: 0, bytes: 0 };
  existing.files++;
  existing.bytes += bytes;
  bucket.set(key, existing);
}

function collectTrackedStats(trackedFiles, options) {
  const categories = new Map();
  const directories = new Map();
  const largestFiles = [];
  const sourceHotspots = [];
  let totalBytes = 0;
  let processedFiles = 0;
  const missingFiles = [];

  for (const relPath of trackedFiles) {
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      missingFiles.push(relPath);
      continue;
    }

    const stat = fs.statSync(absPath);
    const bytes = stat.size;
    processedFiles++;
    totalBytes += bytes;

    addStat(categories, categorizeTrackedFile(relPath), bytes);
    addStat(directories, topLevelBucket(relPath), bytes);
    largestFiles.push({ path: relPath, bytes });

    if (isSourceOrTest(relPath)) {
      const lines = lineCountForFile(absPath);
      if (lines >= options.minLines) {
        sourceHotspots.push({ path: relPath, lines, bytes });
      }
    }
  }

  return {
    total: {
      files: processedFiles,
      bytes: totalBytes,
      missingFiles: missingFiles.length,
    },
    missingFiles,
    categories: [...categories.values()].sort(compareNamedBytesDesc),
    directories: [...directories.values()].sort(compareNamedBytesDesc),
    largestFiles: largestFiles.sort(compareByBytesDesc).slice(0, options.top),
    sourceHotspots: sourceHotspots.sort(compareByLinesDesc).slice(0, options.top),
  };
}

function collectLocalDiskStats() {
  const targets = [];

  for (const target of LOCAL_DISK_TARGETS) {
    const absPath = path.join(repoRoot, target);
    if (!fs.existsSync(absPath)) continue;

    const output = execFileSync(DU_BIN, ['-sk', target], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: SAFE_EXEC_ENV,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim(); // NOSONAR - DU_BIN is absolute and SAFE_EXEC_ENV pins PATH to system directories.
    const [rawKb] = output.split(/\s+/u);
    const bytes = Number(rawKb) * 1024;
    targets.push({ path: target, bytes });
  }

  return targets.sort(compareByBytesDesc);
}

function readBudget(budgetPath) {
  const absPath = resolveRepoPath(budgetPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Repo size budget not found: ${budgetPath}`);
  }

  const budget = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  validateBudget(budget, budgetPath);
  return budget;
}

function resolveRepoPath(inputPath) {
  const absPath = path.resolve(repoRoot, inputPath);
  const relPath = path.relative(repoRoot, absPath);
  if (relPath === '' || relPath.startsWith('..') || path.isAbsolute(relPath)) {
    throw new Error(`Repo size budget path must stay inside the repository: ${inputPath}`);
  }
  return absPath;
}

function validateBudget(budget, budgetPath) {
  if (!budget || typeof budget !== 'object') {
    throw new Error(`Repo size budget must be a JSON object: ${budgetPath}`);
  }

  const allowedKeys = new Set([
    'version',
    'maxTrackedBytes',
    'maxTrackedFiles',
    'maxLargestFileBytes',
    'maxSourceOrTestLines',
    'maxCategoryBytes',
  ]);
  for (const key of Object.keys(budget)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Repo size budget includes unsupported key: ${key}`);
    }
  }

  if (budget.version !== 1) {
    throw new Error(`Unsupported repo size budget version in ${budgetPath}: ${budget.version}`);
  }

  const numericKeys = [
    'maxTrackedBytes',
    'maxTrackedFiles',
    'maxLargestFileBytes',
    'maxSourceOrTestLines',
  ];
  for (const key of numericKeys) {
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

function evaluateBudget(report, budget) {
  const violations = [];
  const largestFile = report.tracked.largestFiles[0];
  const largestSourceOrTest = report.tracked.sourceHotspots[0];

  addViolationIfOver(
    violations,
    'tracked-bytes',
    report.tracked.total.bytes,
    budget.maxTrackedBytes,
    'Tracked repo size'
  );
  addViolationIfOver(
    violations,
    'tracked-files',
    report.tracked.total.files,
    budget.maxTrackedFiles,
    'Tracked file count'
  );

  if (largestFile) {
    addViolationIfOver(
      violations,
      'largest-file-bytes',
      largestFile.bytes,
      budget.maxLargestFileBytes,
      `Largest tracked file (${largestFile.path})`
    );
  }

  if (largestSourceOrTest) {
    addViolationIfOver(
      violations,
      'source-or-test-lines',
      largestSourceOrTest.lines,
      budget.maxSourceOrTestLines,
      `Largest source/test file (${largestSourceOrTest.path})`
    );
  }

  for (const category of report.tracked.categories) {
    const limit = budget.maxCategoryBytes[category.name];
    if (!limit) {
      violations.push({
        code: `category-budget-missing:${category.name}`,
        label: `Tracked category "${category.name}"`,
        actual: category.bytes,
        limit: 0,
      });
      continue;
    }

    addViolationIfOver(
      violations,
      `category:${category.name}`,
      category.bytes,
      limit,
      `Tracked category "${category.name}"`
    );
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

function addViolationIfOver(violations, code, actual, limit, label) {
  if (actual <= limit) return;

  violations.push({
    code,
    label,
    actual,
    limit,
  });
}

function sanitizeBudgetForReport(budget) {
  return {
    version: budget.version,
    maxTrackedBytes: budget.maxTrackedBytes,
    maxTrackedFiles: budget.maxTrackedFiles,
    maxLargestFileBytes: budget.maxLargestFileBytes,
    maxSourceOrTestLines: budget.maxSourceOrTestLines,
    maxCategoryBytes: { ...budget.maxCategoryBytes },
  };
}

function printBudgetResult(result) {
  if (result.passed) {
    console.log('Repo size budget passed.');
    return;
  }

  console.error('Repo size budget failed.');
  printTable(
    result.violations.map(violation => ({
      ...violation,
      actualDisplay:
        violation.code.includes('bytes') || violation.code.startsWith('category:')
          ? formatBytes(violation.actual)
          : violation.actual,
      limitDisplay:
        violation.code.includes('bytes') || violation.code.startsWith('category:')
          ? formatBytes(violation.limit)
          : violation.limit,
    })),
    [
      { header: 'Code', value: row => row.code },
      { header: 'Actual', value: row => row.actualDisplay },
      { header: 'Limit', value: row => row.limitDisplay },
      { header: 'Label', value: row => row.label },
    ]
  );
}

function printTable(rows, columns) {
  const widths = columns.map(column => {
    return Math.max(
      column.header.length,
      ...rows.map(row => safeDisplay(column.value(row)).length)
    );
  });

  console.log(columns.map((column, i) => column.header.padEnd(widths[i])).join('  '));
  console.log(columns.map((_, i) => '-'.repeat(widths[i])).join('  '));
  for (const row of rows) {
    console.log(
      columns.map((column, i) => safeDisplay(column.value(row)).padEnd(widths[i])).join('  ')
    );
  }
}

function safeDisplay(value) {
  const text = String(value).replace(/[\u0000-\u001f\u007f]/gu, char => {
    const code = char.codePointAt(0).toString(16).padStart(2, '0');
    return `\\x${code}`;
  });

  return text.startsWith('::') ? `\\${text}` : text;
}

function printReport(report) {
  console.log('Repo Size Audit');
  console.log(`Repo files: ${report.tracked.total.files}`);
  console.log(`Repo file size: ${formatBytes(report.tracked.total.bytes)}`);

  if (report.localDisk?.length) {
    console.log('\nLocal Disk Artifacts');
    printTable(report.localDisk, [
      { header: 'Size', value: row => formatBytes(row.bytes) },
      { header: 'Path', value: row => row.path },
    ]);
  }

  console.log('\nTracked Categories');
  printTable(report.tracked.categories, [
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Files', value: row => row.files },
    { header: 'Category', value: row => row.name },
  ]);

  console.log('\nTop Tracked Directories');
  printTable(report.tracked.directories.slice(0, report.options.top), [
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Files', value: row => row.files },
    { header: 'Directory', value: row => row.name },
  ]);

  console.log('\nLargest Tracked Files');
  printTable(report.tracked.largestFiles, [
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Path', value: row => row.path },
  ]);

  console.log(`\nSource/Test Hotspots >= ${report.options.minLines} Lines`);
  printTable(report.tracked.sourceHotspots, [
    { header: 'Lines', value: row => row.lines },
    { header: 'Size', value: row => formatBytes(row.bytes) },
    { header: 'Path', value: row => row.path },
  ]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    options.minLines = 0;
    options.includeUntracked = false;
  }

  const budget = options.check ? readBudget(options.budgetPath) : null;
  const trackedFiles = getTrackedFiles(options);
  const report = {
    generatedAt: new Date().toISOString(),
    options,
    tracked: collectTrackedStats(trackedFiles, options),
    localDisk: options.includeDisk ? collectLocalDiskStats() : [],
  };

  if (options.check) {
    const result = evaluateBudget(report, budget);
    if (options.json) {
      console.log(
        JSON.stringify(
          { ...report, budget: sanitizeBudgetForReport(budget), budgetResult: result },
          null,
          2
        )
      );
    } else {
      printBudgetResult(result);
    }
    if (!result.passed) process.exit(1);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printReport(report);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
