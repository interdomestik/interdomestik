#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  readNonEmptyValue,
  stableJson,
  synchronizedBudget,
} from './repo-size-budget-sync-core.mjs';

const DEFAULT_BUDGET_PATH = 'scripts/repo-size-budget.json';

function parseArgs(argv) {
  const options = {
    budgetPath: DEFAULT_BUDGET_PATH,
    check: false,
    dryRun: false,
    includeUntracked: true,
  };
  for (const arg of argv) {
    if (arg === '--') {
      continue;
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--tracked-only') {
      options.includeUntracked = false;
    } else if (arg.startsWith('--budget=')) {
      options.budgetPath = readNonEmptyValue(arg, '--budget=');
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/repo-size-budget-sync.mjs [--check] [--dry-run] [--tracked-only] [--budget=<path>]'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function repoRoot() {
  return execFileSync('/usr/bin/git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  }).trim();
}

function readAudit(root, options) {
  const args = ['scripts/repo-size-audit.mjs', '--json', '--no-disk', '--min-lines=0', '--top=1'];
  if (options.includeUntracked) args.push('--include-untracked');
  const output = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  return JSON.parse(output);
}

function resolveBudgetPath(root, inputPath) {
  const absPath = path.resolve(root, inputPath);
  const relPath = path.relative(root, absPath);
  if (relPath === '' || relPath.startsWith('..') || path.isAbsolute(relPath)) {
    throw new Error(`Budget path must stay inside repository: ${inputPath}`);
  }
  return absPath;
}

function isAuditedFile(root, relPath, options) {
  const args = ['ls-files', '-z', '--cached'];
  if (options.includeUntracked) args.push('--others', '--exclude-standard');
  args.push('--', relPath);
  return execFileSync('/usr/bin/git', args, {
    cwd: root,
    encoding: 'buffer',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  }).length > 0;
}

function changedKeys(before, after) {
  return Object.keys(after).filter(
    key => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = repoRoot();
  const budgetPath = resolveBudgetPath(root, options.budgetPath);
  const budgetRelPath = path.relative(root, budgetPath);
  const previousText = fs.readFileSync(budgetPath, 'utf8');
  const previousBudget = JSON.parse(previousText);
  const report = readAudit(root, options);
  const nextBudget = synchronizedBudget(
    report,
    previousBudget,
    budgetRelPath,
    previousText,
    isAuditedFile(root, budgetRelPath, options)
  );
  const changed = stableJson(previousBudget) !== stableJson(nextBudget);

  if (!changed) {
    console.log('Repo size budget is already synchronized.');
    return;
  }

  console.log(`Repo size budget drift: ${changedKeys(previousBudget, nextBudget).join(', ')}`);
  if (options.check) process.exit(1);
  if (!options.dryRun) fs.writeFileSync(budgetPath, stableJson(nextBudget));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
