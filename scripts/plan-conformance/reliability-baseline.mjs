#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CONFORMANCE_LOG = path.join(
  'docs',
  'plans',
  '2026-03-03-implementation-conformance-log.jsonl'
);
const DEFAULT_OUT_PATH = path.join('docs', 'plans', '2026-03-03-f1-baseline-report.json');
const VALID_FOCUS = new Set(['all', 'pass_fail', 'flake', 'unrelated']);

function parseJsonl(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`conformance log not found: ${absolutePath}`);
  }

  return fs
    .readFileSync(absolutePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`invalid JSONL line ${index + 1}: ${error.message}`);
      }
    });
}

function writeJson(filePath, payload) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function computePassFail(entries) {
  const checksByName = new Map();
  let requiredTotal = 0;
  let requiredPass = 0;
  let requiredFail = 0;

  for (const entry of entries) {
    const checks = asArray(entry.checks);

    for (const check of checks) {
      if (!check || typeof check !== 'object') continue;

      const name = typeof check.name === 'string' ? check.name : '<unknown>';
      const status = typeof check.status === 'string' ? check.status : 'unknown';
      const required = check.required !== false;

      if (!checksByName.has(name)) {
        checksByName.set(name, {
          total: 0,
          pass: 0,
          fail: 0,
          warn: 0,
          skip: 0,
          unknown: 0,
        });
      }

      const bucket = checksByName.get(name);
      bucket.total += 1;
      if (bucket[status] !== undefined) {
        bucket[status] += 1;
      } else {
        bucket.unknown += 1;
      }

      if (required) {
        requiredTotal += 1;
        if (status === 'pass') {
          requiredPass += 1;
        } else if (status === 'fail') {
          requiredFail += 1;
        }
      }
    }
  }

  const check_summary = {};
  for (const [name, bucket] of checksByName.entries()) {
    check_summary[name] = {
      ...bucket,
      pass_rate_pct: bucket.total > 0 ? Number(((bucket.pass / bucket.total) * 100).toFixed(2)) : 0,
    };
  }

  return {
    required_total: requiredTotal,
    required_pass: requiredPass,
    required_fail: requiredFail,
    required_pass_rate_pct:
      requiredTotal > 0 ? Number(((requiredPass / requiredTotal) * 100).toFixed(2)) : 0,
    check_summary,
  };
}

function computeRuntime(entries) {
  const durations = [];

  for (const entry of entries) {
    const entryDuration = toNumber(entry.duration_ms);
    if (entryDuration !== null) {
      durations.push(entryDuration);
      continue;
    }

    for (const check of asArray(entry.checks)) {
      const duration = toNumber(check?.duration_ms);
      if (duration !== null) {
        durations.push(duration);
      }
    }
  }

  if (durations.length === 0) {
    return {
      sample_count: 0,
      median_ms: null,
      p95_ms: null,
      evidence: 'Not Present in Current Repo Evidence',
    };
  }

  const sorted = [...durations].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2))
      : Number(sorted[middle].toFixed(2));
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);

  return {
    sample_count: sorted.length,
    median_ms: median,
    p95_ms: Number(sorted[p95Index].toFixed(2)),
    evidence: 'Derived from conformance duration fields',
  };
}

function computeFlaky(entries) {
  const statusesByCheck = new Map();

  for (const entry of entries) {
    for (const check of asArray(entry.checks)) {
      if (!check || typeof check !== 'object') continue;
      const name = typeof check.name === 'string' ? check.name : '<unknown>';
      const status = typeof check.status === 'string' ? check.status : 'unknown';

      if (!statusesByCheck.has(name)) {
        statusesByCheck.set(name, []);
      }
      statusesByCheck.get(name).push(status);
    }
  }

  const flaky_checks = [];

  for (const [name, statuses] of statusesByCheck.entries()) {
    const hasFail = statuses.includes('fail');
    const hasPass = statuses.includes('pass');
    if (hasFail && hasPass) {
      flaky_checks.push(name);
    }
  }

  return {
    flaky_check_count: flaky_checks.length,
    flaky_checks: flaky_checks.sort(),
  };
}

function computeUnrelatedFailureRate(entries) {
  let totalFailuresOrWarnings = 0;
  let unrelatedFailuresOrWarnings = 0;

  for (const entry of entries) {
    for (const check of asArray(entry.checks)) {
      const status = typeof check?.status === 'string' ? check.status : '';
      if (!(status === 'fail' || status === 'warn')) {
        continue;
      }

      totalFailuresOrWarnings += 1;
      const required = check.required !== false;
      if (!required) {
        unrelatedFailuresOrWarnings += 1;
      }
    }
  }

  const rate =
    totalFailuresOrWarnings > 0
      ? Number(((unrelatedFailuresOrWarnings / totalFailuresOrWarnings) * 100).toFixed(2))
      : 0;

  return {
    total_fail_or_warn: totalFailuresOrWarnings,
    unrelated_fail_or_warn: unrelatedFailuresOrWarnings,
    unrelated_failure_rate_pct: rate,
  };
}

export function buildReliabilityBaseline(entries, focus = 'all') {
  if (!VALID_FOCUS.has(focus)) {
    throw new Error(`unsupported focus: ${focus}`);
  }

  const payload = {
    version: '1.0.0',
    focus,
    generated_at: new Date().toISOString(),
    source_entries: entries.length,
  };

  if (focus === 'all' || focus === 'pass_fail') {
    payload.pass_fail = computePassFail(entries);
    payload.runtime = computeRuntime(entries);
  }

  if (focus === 'all' || focus === 'flake') {
    payload.flaky = computeFlaky(entries);
  }

  if (focus === 'all' || focus === 'unrelated') {
    payload.unrelated = computeUnrelatedFailureRate(entries);
  }

  return payload;
}

function printUsage() {
  console.log(
    'reliability-baseline\\n\\nUsage:\\n  node scripts/plan-conformance/reliability-baseline.mjs [--log <jsonl>] [--focus all|pass_fail|flake|unrelated] [--out <path>]'
  );
}

function parseArgs(argv) {
  const args = {
    logPath: DEFAULT_CONFORMANCE_LOG,
    focus: 'all',
    outPath: DEFAULT_OUT_PATH,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--log' && next) {
      args.logPath = next;
      index += 1;
      continue;
    }

    if (token === '--focus' && next) {
      args.focus = next;
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

  const entries = parseJsonl(args.logPath);
  const report = buildReliabilityBaseline(entries, args.focus);
  writeJson(args.outPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`[reliability-baseline] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
