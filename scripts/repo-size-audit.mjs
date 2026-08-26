#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { evaluateCapacityBudget } from './repo-size-capacity-evaluator.mjs';
import { validateCapacityBudget } from './repo-size-capacity-schema.mjs';
import { collectGitChangeFacts } from './repo-size-git-attribution.mjs';
import {
  collectLocalDiskStats,
  collectTrackedStats,
  getTrackedFiles,
} from './repo-size-inventory.mjs';
import { printBudgetResult, printReport } from './repo-size-audit-output.mjs';
import {
  evaluateLegacyBudget,
  sanitizeLegacyBudget,
  validateLegacyBudget,
} from './repo-size-legacy-budget.mjs';

const DEFAULT_BUDGET_PATH = 'scripts/repo-size-budget.json';
const SAFE_EXEC_ENV = Object.freeze({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
const GIT_BIN = '/usr/bin/git';
const DU_BIN = '/usr/bin/du';
const repoRoot = getRepoRoot();
const system = { gitBin: GIT_BIN, duBin: DU_BIN, env: SAFE_EXEC_ENV };

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
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--json') options.json = true;
    else if (arg === '--check') {
      options.check = true;
      options.includeDisk = false;
    } else if (arg === '--no-disk') options.includeDisk = false;
    else if (arg === '--include-untracked') options.includeUntracked = true;
    else if (arg.startsWith('--budget=')) {
      options.budgetPath = readNonEmptyValue(arg, '--budget=');
    } else if (arg.startsWith('--top=')) options.top = readInteger(arg, '--top=', true);
    else if (arg.startsWith('--min-lines=')) {
      options.minLines = readInteger(arg, '--min-lines=', false);
    } else throw new Error(`Unknown argument: ${arg}`);
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
  }).trim(); // NOSONAR - absolute executable and fixed system PATH.
}

function readNonEmptyValue(arg, prefix) {
  const value = arg.slice(prefix.length).trim();
  if (!value) throw new Error(`${prefix.slice(0, -1)} requires a non-empty value.`);
  return value;
}

function readInteger(arg, prefix, positive) {
  const value = Number(arg.slice(prefix.length));
  if (!Number.isInteger(value) || (positive ? value <= 0 : value < 0)) {
    throw new Error(
      `${prefix.slice(0, -1)} must be a ${positive ? 'positive' : 'non-negative'} integer.`
    );
  }
  return value;
}

function resolveRepoPath(inputPath) {
  const absolutePath = path.resolve(repoRoot, inputPath);
  const relativePath = path.relative(repoRoot, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Repo size budget path must stay inside the repository: ${inputPath}`);
  }
  return absolutePath;
}

function readBudget(budgetPath) {
  const absolutePath = resolveRepoPath(budgetPath);
  if (!fs.existsSync(absolutePath)) throw new Error(`Repo size budget not found: ${budgetPath}`);
  const budget = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (budget?.version === 2) validateCapacityBudget(budget);
  else validateLegacyBudget(budget, budgetPath);
  return budget;
}

function evaluateBudget(report, budget, trackedFiles) {
  if (budget.version !== 2) return evaluateLegacyBudget(report, budget);
  const changeFacts = collectGitChangeFacts({
    repoRoot,
    baseSha: budget.baseline.protectedMainSha,
    trackedFiles,
    ...system,
  });
  return evaluateCapacityBudget(report, budget, changeFacts);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    options.minLines = 0;
    options.includeUntracked = false;
  }
  const budget = options.check ? readBudget(options.budgetPath) : null;
  const trackedFiles = getTrackedFiles(repoRoot, options, system);
  const report = {
    generatedAt: new Date().toISOString(),
    options,
    tracked: collectTrackedStats(repoRoot, trackedFiles, options),
    localDisk: options.includeDisk ? collectLocalDiskStats(repoRoot, system) : [],
  };
  if (options.check) {
    const result = evaluateBudget(report, budget, trackedFiles);
    if (options.json) {
      const safeBudget =
        budget.version === 2 ? structuredClone(budget) : sanitizeLegacyBudget(budget);
      console.log(JSON.stringify({ ...report, budget: safeBudget, budgetResult: result }, null, 2));
    } else printBudgetResult(result);
    if (!result.passed) process.exit(1);
    return;
  }
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
