#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{40}$/u;
const LEGACY_EXACT_PATHS = new Set([
  '.github/actions/validation-surface/action.yml',
  '.github/workflows/ci.yml',
  'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json',
  'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json',
  'docs/plans/current-authority-v1.json',
  'docs/plans/history/2026-09-22-current-program-ledger.md',
  'docs/plans/history/2026-09-22-current-tracker-ledger.md',
  'scripts/ci/lean-current-authority-contracts.legacy.mjs',
]);
const LEGACY_PREFIXES = [
  'docs/plans/history/current-authority/',
  'scripts/current-authority-format-audit.',
  'scripts/current-authority-state',
  'scripts/ci/exact-delivery',
  'scripts/lean-',
  'scripts/slice-rehearse',
  'scripts/slice-telemetry',
  'scripts/ci/legacy-validation-surface.',
];
const LEGACY_PACKAGE_SCRIPTS = new Set(['legacy:validate', 'plan:audit:legacy', 'test:harness-v2']);
const LEGACY_BUDGET_ALLOCATION = 'staff-current-claim-policy';

function parseArgs(argv) {
  const values = { base: '', head: '', root: process.cwd() };
  const args = [...argv];
  while (args.length > 0) {
    const key = args.shift();
    const value = args.shift();
    if (!value) throw new Error(`missing value for ${key}`);
    if (key === '--base') values.base = value;
    else if (key === '--head') values.head = value;
    else if (key === '--root') values.root = resolve(value);
    else throw new Error(`unknown argument: ${key}`);
  }
  return values;
}

function legacyPath(path) {
  return LEGACY_EXACT_PATHS.has(path) || LEGACY_PREFIXES.some(prefix => path.startsWith(prefix));
}

function changedLegacyPackageScript(beforeText, afterText) {
  try {
    const before = JSON.parse(beforeText || '{}').scripts ?? {};
    const after = JSON.parse(afterText || '{}').scripts ?? {};
    return [...LEGACY_PACKAGE_SCRIPTS].some(name => before[name] !== after[name]);
  } catch {
    return true;
  }
}

function changedLegacyBudgetAllocation(beforeText, afterText) {
  try {
    const allocation = text =>
      (JSON.parse(text || '{}').allocations ?? []).find(
        item => item?.id === LEGACY_BUDGET_ALLOCATION
      ) ?? null;
    return JSON.stringify(allocation(beforeText)) !== JSON.stringify(allocation(afterText));
  } catch {
    return true;
  }
}

export function evaluateLegacyValidation({
  changedFiles = [],
  packageBefore = '',
  packageAfter = '',
  budgetBefore = '',
  budgetAfter = '',
  evidenceComplete = true,
} = {}) {
  if (!evidenceComplete) {
    return { shouldRun: true, reason: 'changed_files_incomplete', matchedPaths: [] };
  }
  const normalized = [...new Set(changedFiles.map(value => String(value).trim()).filter(Boolean))];
  const matchedPaths = normalized.filter(legacyPath);
  if (
    normalized.includes('package.json') &&
    changedLegacyPackageScript(packageBefore, packageAfter)
  ) {
    matchedPaths.push('package.json');
  }
  if (
    normalized.includes('scripts/repo-size-budget.json') &&
    changedLegacyBudgetAllocation(budgetBefore, budgetAfter)
  ) {
    matchedPaths.push('scripts/repo-size-budget.json');
  }
  const uniqueMatches = [...new Set(matchedPaths)].sort((left, right) => left.localeCompare(right));
  return {
    shouldRun: uniqueMatches.length > 0,
    reason: uniqueMatches.length > 0 ? 'legacy_surface_changed' : 'legacy_surface_unchanged',
    matchedPaths: uniqueMatches,
  };
}

function git(root, args) {
  return execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000,
  });
}

export function parseChangedFiles(nameStatusText) {
  return String(nameStatusText)
    .split(/\r?\n/u)
    .filter(Boolean)
    .flatMap(line => {
      const [status = '', ...paths] = line.split('\t');
      if (!/^(?:[ACDMRTUXB]|R\d+|C\d+)$/u.test(status) || paths.length === 0) {
        throw new Error(`malformed git name-status record: ${line}`);
      }
      return paths;
    });
}

function evaluateRepository({ root, base, head }) {
  if (!SHA.test(base) || !SHA.test(head)) {
    return evaluateLegacyValidation({ evidenceComplete: false });
  }
  try {
    const changedFiles = parseChangedFiles(
      git(root, [
        'diff',
        '--name-status',
        '--find-renames',
        '--diff-filter=ACDMRTUXB',
        `${base}...${head}`,
      ])
    );
    let packageBefore = '';
    let packageAfter = '';
    let budgetBefore = '';
    let budgetAfter = '';
    if (changedFiles.includes('package.json')) {
      packageBefore = git(root, ['show', `${base}:package.json`]);
      packageAfter = git(root, ['show', `${head}:package.json`]);
    }
    if (changedFiles.includes('scripts/repo-size-budget.json')) {
      budgetBefore = git(root, ['show', `${base}:scripts/repo-size-budget.json`]);
      budgetAfter = git(root, ['show', `${head}:scripts/repo-size-budget.json`]);
    }
    return evaluateLegacyValidation({
      changedFiles,
      packageBefore,
      packageAfter,
      budgetBefore,
      budgetAfter,
    });
  } catch {
    return evaluateLegacyValidation({ evidenceComplete: false });
  }
}

function main() {
  const result = evaluateRepository(parseArgs(process.argv.slice(2)));
  process.stdout.write(`should_run=${String(result.shouldRun)}\n`);
  process.stdout.write(`reason=${result.reason}\n`);
  process.stdout.write(`matched_paths=${JSON.stringify(result.matchedPaths)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
