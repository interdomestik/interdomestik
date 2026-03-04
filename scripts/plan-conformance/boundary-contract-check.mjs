#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPORT_PATH = path.join('tmp', 'plan-conformance', 'boundary-diff-report.json');
const DEFAULT_OUT_PATH = path.join('tmp', 'plan-conformance', 'boundary-contract-check.json');
const VALID_MODES = new Set(['advisory', 'enforced']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function evaluateBoundaryContract(report, mode = 'advisory') {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`unsupported mode: ${mode}`);
  }

  if (!report || typeof report !== 'object') {
    throw new Error('boundary report must be an object');
  }

  const summary = report.summary || {};
  const noTouchTouched = toNumber(summary.no_touch_touched);
  const protectedTouched = toNumber(summary.protected_touched);

  let contractStatus = 'pass';
  let decisionHint = 'continue';
  const reasons = [];

  if (noTouchTouched > 0) {
    contractStatus = 'fail';
    decisionHint = 'rollback';
    reasons.push('No-touch zones were modified.');
  } else if (protectedTouched > 0) {
    contractStatus = 'warn';
    decisionHint = 'pause';
    reasons.push('Protected boundary surfaces changed and require owner review.');
  } else {
    reasons.push('No no-touch or protected boundary changes detected.');
  }

  const shouldExitNonZero = mode === 'enforced' && contractStatus === 'fail';

  return {
    version: '1.0.0',
    mode,
    evaluated_at: new Date().toISOString(),
    contract_status: contractStatus,
    decision_hint: decisionHint,
    should_exit_nonzero: shouldExitNonZero,
    summary: {
      no_touch_touched: noTouchTouched,
      protected_touched: protectedTouched,
      advisory_watch_touched: toNumber(summary.advisory_watch_touched),
      unclassified: toNumber(summary.unclassified),
    },
    reasons,
  };
}

function printUsage() {
  console.log(
    'boundary-contract-check\\n\\nUsage:\\n  node scripts/plan-conformance/boundary-contract-check.mjs [--report <path>] [--mode advisory|enforced] [--out <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    reportPath: DEFAULT_REPORT_PATH,
    mode: 'advisory',
    outPath: DEFAULT_OUT_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--report' && next) {
      args.reportPath = next;
      index += 1;
      continue;
    }

    if (token === '--mode' && next) {
      args.mode = next;
      index += 1;
      continue;
    }

    if (token === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }

    if (token === '-h' || token === '--help') {
      args.help = true;
    }
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  const report = readJson(args.reportPath);
  const evaluation = evaluateBoundaryContract(report, args.mode);

  writeJson(args.outPath, evaluation);
  process.stdout.write(`${JSON.stringify(evaluation, null, 2)}\n`);

  if (evaluation.should_exit_nonzero) {
    process.exitCode = 1;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[boundary-contract-check] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
