#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildBenchmarkScorecard } from './benchmark-core.mjs';

const DEFAULT_SUITE = 'scripts/multi-agent/benchmark-suite.internal.json';
const DEFAULT_OUT_DIR = 'tmp/multi-agent/benchmarks';

function parseArgs(argv) {
  const parsed = {
    suite: DEFAULT_SUITE,
    outDir: DEFAULT_OUT_DIR,
    runId: '',
    maxFailures: Number.MAX_SAFE_INTEGER,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '-h' || token === '--help') {
      parsed.help = true;
      continue;
    }
    if (token === '--suite' && next) {
      parsed.suite = next;
      i += 1;
      continue;
    }
    if (token === '--out-dir' && next) {
      parsed.outDir = next;
      i += 1;
      continue;
    }
    if (token === '--run-id' && next) {
      parsed.runId = next;
      i += 1;
      continue;
    }
    if (token === '--max-failures' && next) {
      const parsedFailures = Number(next);
      if (Number.isFinite(parsedFailures) && parsedFailures >= 0) {
        parsed.maxFailures = Math.floor(parsedFailures);
      }
      i += 1;
      continue;
    }
  }

  return parsed;
}

function printHelp() {
  process.stdout.write(`benchmark-lane

Usage:
  node scripts/multi-agent/benchmark-lane.mjs [options]

Options:
  --suite <path>           Suite JSON path (default: ${DEFAULT_SUITE})
  --out-dir <path>         Output root directory (default: ${DEFAULT_OUT_DIR})
  --run-id <id>            Optional run id (default: UTC timestamp)
  --max-failures <count>   Stop early after N failures (default: unlimited)
  -h, --help               Show help
`);
}

function safeSlug(value, fallback) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || fallback;
}

function utcRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function readSuite(suitePath) {
  const absolutePath = path.resolve(suitePath);
  const suite = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  if (!Array.isArray(suite.benchmarks) || suite.benchmarks.length === 0) {
    throw new Error('Benchmark suite must define a non-empty "benchmarks" array');
  }
  return suite;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function renderMarkdown(scorecard, executions) {
  const lines = [
    `# ${scorecard.suiteName} Scorecard`,
    '',
    `- Started: ${scorecard.startedAt}`,
    `- Ended: ${scorecard.endedAt}`,
    `- Total runs: ${scorecard.totalRuns}`,
    `- Success rate: ${(scorecard.successRate * 100).toFixed(2)}%`,
    `- Total cost (USD): ${scorecard.totalCostUsd.toFixed(4)}`,
    '',
    '## Per Role Metrics',
    '',
    '| Role | Runs | Success Rate | Avg Latency (ms) | P95 Latency (ms) | Tokens | Cost (USD) | Quality/$ |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const [role, metric] of Object.entries(scorecard.roleMetrics)) {
    lines.push(
      `| ${role} | ${metric.totalRuns} | ${(metric.successRate * 100).toFixed(2)}% | ${metric.avgLatencyMs} | ${metric.p95LatencyMs} | ${metric.totalTokens} | ${metric.totalCostUsd.toFixed(4)} | ${metric.qualityPerDollar.toFixed(2)} |`
    );
  }

  lines.push('', '## Execution Details', '');
  for (const execution of executions) {
    lines.push(
      `- ${execution.id} (${execution.style}, role=${execution.role}) => ${
        execution.success ? 'PASS' : 'FAIL'
      }, latency=${execution.latencyMs}ms, tokens=${execution.tokenCount}, cost=$${execution.costUsd.toFixed(4)}`
    );
    lines.push(`  - log: ${execution.logPath}`);
  }

  return `${lines.join('\n')}\n`;
}

function runBenchmarkCase({ benchmark, suiteDefaults, rootDir, runDir, index }) {
  const id = safeSlug(benchmark.id, `benchmark-${index + 1}`);
  const role = String(benchmark.role || 'unknown');
  const style = String(benchmark.style || 'internal');
  const command = String(benchmark.command || '').trim();
  if (!command) {
    throw new Error(`Benchmark "${id}" is missing command`);
  }

  const timeoutSeconds = Number(benchmark.timeoutSeconds ?? suiteDefaults.timeoutSeconds ?? 900);
  const timeoutMs = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds * 1000 : 0;
  const tokenEstimate = Number(benchmark.tokenEstimate ?? suiteDefaults.tokenEstimateByRole?.[role] ?? 0);
  const usdPer1kTokens = Number(
    benchmark.usdPer1kTokens ?? suiteDefaults.usdPer1kTokens ?? 0
  );
  const workingDirectory = path.resolve(rootDir, benchmark.cwd || '.');
  const logPath = path.join(runDir, `${String(index + 1).padStart(2, '0')}-${id}.log`);

  const startedMs = Date.now();
  const child = spawnSync('bash', ['-lc', command], {
    cwd: workingDirectory,
    encoding: 'utf8',
    timeout: timeoutMs > 0 ? timeoutMs : undefined,
    maxBuffer: 20 * 1024 * 1024,
  });
  const endedMs = Date.now();
  const latencyMs = Math.max(0, endedMs - startedMs);
  const success = child.status === 0;
  const output = [child.stdout || '', child.stderr || ''].filter(Boolean).join('\n');
  fs.writeFileSync(logPath, output, 'utf8');

  const costUsd = Math.max(0, (Math.max(0, tokenEstimate) / 1000) * Math.max(0, usdPer1kTokens));

  return {
    id,
    style,
    role,
    command,
    success,
    exitCode: child.status ?? 1,
    latencyMs,
    tokenCount: Math.max(0, Math.round(tokenEstimate)),
    costUsd,
    logPath: path.resolve(logPath),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, '..', '..');
  const suite = readSuite(args.suite);
  const runId = safeSlug(args.runId, utcRunId());
  const runDir = path.resolve(args.outDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const executions = [];
  let failedCount = 0;

  for (let index = 0; index < suite.benchmarks.length; index += 1) {
    const benchmark = suite.benchmarks[index];
    const execution = runBenchmarkCase({
      benchmark,
      suiteDefaults: suite.defaults || {},
      rootDir,
      runDir,
      index,
    });
    executions.push(execution);
    if (!execution.success) {
      failedCount += 1;
      if (failedCount >= args.maxFailures) {
        break;
      }
    }
  }

  const endedAt = new Date().toISOString();
  const scorecard = buildBenchmarkScorecard({
    suiteName: suite.suiteName || 'multi-agent-internal-suite',
    startedAt,
    endedAt,
    executions,
  });

  const resultsPath = path.join(runDir, 'results.json');
  const scorecardPath = path.join(runDir, 'scorecard.json');
  const markdownPath = path.join(runDir, 'scorecard.md');

  writeJson(resultsPath, {
    suitePath: path.resolve(args.suite),
    runId,
    startedAt,
    endedAt,
    executions,
  });
  writeJson(scorecardPath, scorecard);
  fs.writeFileSync(markdownPath, renderMarkdown(scorecard, executions), 'utf8');

  process.stdout.write(`[benchmark-lane] run_dir=${runDir}\n`);
  process.stdout.write(`[benchmark-lane] scorecard=${scorecardPath}\n`);
  process.stdout.write(`[benchmark-lane] markdown=${markdownPath}\n`);
  process.stdout.write(
    `[benchmark-lane] success_rate=${(scorecard.successRate * 100).toFixed(2)}% failed_runs=${scorecard.failedRuns}\n`
  );

  if (scorecard.failedRuns > 0) {
    process.exit(1);
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
    process.stderr.write(`[benchmark-lane] FAIL: ${error.message}\n`);
    process.exit(1);
  }
}
