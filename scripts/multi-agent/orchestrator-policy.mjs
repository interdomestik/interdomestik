#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID_MODES = new Set(['auto', 'single', 'multi']);
const VALID_COMPLEXITIES = new Set(['low', 'medium', 'high']);

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMode(value) {
  const normalized = String(value || 'auto')
    .trim()
    .toLowerCase();
  if (VALID_MODES.has(normalized)) {
    return normalized;
  }
  return 'auto';
}

function normalizeComplexity(value) {
  const normalized = String(value || 'medium')
    .trim()
    .toLowerCase();
  if (VALID_COMPLEXITIES.has(normalized)) {
    return normalized;
  }
  return 'medium';
}

function parseBoolean(value, fallback = false) {
  if (value == null) return fallback;
  const normalized = String(value)
    .trim()
    .toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function complexityScore(complexity) {
  if (complexity === 'high') return 3;
  if (complexity === 'medium') return 2;
  return 1;
}

function taskParallelismScore(taskCount) {
  if (taskCount >= 4) return 2;
  if (taskCount >= 2) return 1;
  return 0;
}

function budgetPenalty(estimatedCostUsd, budgetUsd) {
  if (budgetUsd <= 0) return 3;
  if (estimatedCostUsd > budgetUsd) return 2;
  if (estimatedCostUsd > budgetUsd * 0.7) return 1;
  return 0;
}

export function decideExecutionMode(input = {}) {
  const mode = normalizeMode(input.mode);
  const complexity = normalizeComplexity(input.complexity);
  const estimatedCostUsd = Math.max(0, toNumber(input.estimatedCostUsd, 0));
  const budgetUsd = Math.max(0, toNumber(input.budgetUsd, 0));
  const taskCount = Math.max(1, Math.floor(toNumber(input.taskCount, 1)));
  const requiresBoundaryReview = parseBoolean(input.requiresBoundaryReview, false);

  if (mode === 'single' || mode === 'multi') {
    return {
      selectedMode: mode,
      score: mode === 'multi' ? 999 : -999,
      reasonCodes: ['manual_mode_override'],
      inputs: {
        complexity,
        estimatedCostUsd,
        budgetUsd,
        taskCount,
        requiresBoundaryReview,
      },
    };
  }

  const scoreFromComplexity = complexityScore(complexity);
  const scoreFromParallelism = taskParallelismScore(taskCount);
  const scoreFromBoundary = requiresBoundaryReview ? 2 : 0;
  const scoreFromBudget = budgetPenalty(estimatedCostUsd, budgetUsd);
  const totalScore =
    scoreFromComplexity + scoreFromParallelism + scoreFromBoundary - scoreFromBudget;

  const reasonCodes = [];
  if (scoreFromComplexity >= 3) reasonCodes.push('high_complexity');
  if (scoreFromParallelism >= 1) reasonCodes.push('parallel_task_pressure');
  if (scoreFromBoundary > 0) reasonCodes.push('boundary_review_required');
  if (scoreFromBudget > 0) reasonCodes.push('budget_pressure');

  const selectedMode = totalScore >= 4 ? 'multi' : 'single';
  reasonCodes.push(selectedMode === 'multi' ? 'auto_selected_multi' : 'auto_selected_single');

  return {
    selectedMode,
    score: totalScore,
    reasonCodes,
    inputs: {
      complexity,
      estimatedCostUsd,
      budgetUsd,
      taskCount,
      requiresBoundaryReview,
    },
  };
}

function printHelp() {
  console.log(`orchestrator-policy

Usage:
  node scripts/multi-agent/orchestrator-policy.mjs [options]

Options:
  --mode <auto|single|multi>          Selection mode (default: auto)
  --complexity <low|medium|high>      Task complexity signal (default: medium)
  --estimated-cost-usd <number>       Estimated run cost in USD (default: 0)
  --budget-usd <number>               Budget cap in USD (default: 5)
  --task-count <integer>              Number of independent tasks (default: 1)
  --requires-boundary-review <bool>   Boundary/security review needed (default: false)
  --format <json|mode>                Output format (default: json)
  -h, --help                          Show this help
`);
}

function parseArgs(argv) {
  const parsed = {
    mode: 'auto',
    complexity: 'medium',
    estimatedCostUsd: 0,
    budgetUsd: 5,
    taskCount: 1,
    requiresBoundaryReview: false,
    format: 'json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '-h' || token === '--help') {
      parsed.help = true;
      continue;
    }
    if (token === '--mode' && next) {
      parsed.mode = next;
      i += 1;
      continue;
    }
    if (token === '--complexity' && next) {
      parsed.complexity = next;
      i += 1;
      continue;
    }
    if (token === '--estimated-cost-usd' && next) {
      parsed.estimatedCostUsd = toNumber(next, 0);
      i += 1;
      continue;
    }
    if (token === '--budget-usd' && next) {
      parsed.budgetUsd = toNumber(next, 5);
      i += 1;
      continue;
    }
    if (token === '--task-count' && next) {
      parsed.taskCount = Math.max(1, Math.floor(toNumber(next, 1)));
      i += 1;
      continue;
    }
    if (token === '--requires-boundary-review' && next) {
      parsed.requiresBoundaryReview = parseBoolean(next, false);
      i += 1;
      continue;
    }
    if (token === '--requires-boundary-review') {
      parsed.requiresBoundaryReview = true;
      continue;
    }
    if (token === '--format' && next) {
      parsed.format = String(next || 'json')
        .trim()
        .toLowerCase();
      i += 1;
      continue;
    }
  }

  return parsed;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const decision = decideExecutionMode(args);
  if (args.format === 'mode') {
    process.stdout.write(decision.selectedMode);
    return;
  }

  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  main();
}
