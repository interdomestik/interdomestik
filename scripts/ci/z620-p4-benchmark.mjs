#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { captureCommand, redact, safeId, writeJson } from './z620-runner-lib.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  })
);
if (!args.namespace || !args['evidence-dir']) {
  throw new Error('--namespace and --evidence-dir are required');
}
const namespace = safeId(args.namespace, 'cache namespace');
const evidenceDir = path.resolve(String(args['evidence-dir']));
const cacheRoot = path.resolve(
  String(args['cache-root'] || '/home/arben/ci/interdomestik/cache/turbo')
);
const cacheDir = path.join(cacheRoot, namespace);
if (!cacheDir.startsWith(`${cacheRoot}${path.sep}`) || fs.existsSync(cacheDir)) {
  throw new Error('Benchmark cache namespace must be new and inside cache root');
}
fs.mkdirSync(path.join(evidenceDir, 'logs'), { recursive: true, mode: 0o700 });
fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });

const memAvailableKiB = Number(
  fs.readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m)?.[1] || 0
);
const availableGiB = memAvailableKiB / 1024 ** 2;
if (availableGiB < 12)
  throw new Error(`P4 requires 12 GiB available; found ${availableGiB.toFixed(1)}`);
const postgresBefore = captureCommand('docker', [
  'inspect',
  '-f',
  '{{.State.Health.Status}}/{{.RestartCount}}',
  'supabase_db_interdomestik',
]);

function runTask(name, cpuList, command, commandArgs, round) {
  const started = Date.now();
  const child = spawn('taskset', ['--cpu-list', cpuList, command, ...commandArgs], {
    env: {
      ...process.env,
      NEXT_BUILD_CPUS: '6',
      PLAYWRIGHT_WORKERS: '6',
      TURBO_CONCURRENCY: '6',
      VITEST_MAX_WORKERS: '6',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => (output += chunk));
  child.stderr.on('data', chunk => (output += chunk));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => {
      const log = `round-${round}-${name}.log`;
      fs.writeFileSync(path.join(evidenceDir, 'logs', log), redact(output));
      resolve({
        name,
        cpuList,
        status: code === 0 ? 'pass' : 'fail',
        exitCode: code ?? 1,
        durationMs: Date.now() - started,
        cacheSummary: output.match(/Cached:\\s+[^\\n]+/)?.[0] || 'not-reported',
        log: `logs/${log}`,
      });
    });
  });
}

async function runRound(round) {
  const verify = runTask(
    'verify',
    '0-5,12-17',
    'pnpm',
    [
      'exec',
      'turbo',
      'run',
      'build',
      '--filter=@interdomestik/web...',
      `--cache-dir=${cacheDir}`,
      '--concurrency=6',
      '--summarize',
      '--no-daemon',
    ],
    round
  );
  const e2ePrep = runTask(
    'e2e-prep',
    '6-11,18-23',
    'pnpm',
    ['--filter', '@interdomestik/web', 'run', 'e2e:guards'],
    round
  );
  return Promise.all([verify, e2ePrep]);
}

const startedAt = new Date().toISOString();
const rounds = [await runRound(1), await runRound(2)];
const postgresAfter = captureCommand('docker', [
  'inspect',
  '-f',
  '{{.State.Health.Status}}/{{.RestartCount}}',
  'supabase_db_interdomestik',
]);
const forgejo = captureCommand('curl', [
  '-fsS',
  '-o',
  '/dev/null',
  '-w',
  '%{http_code}',
  'http://127.0.0.1:3000/',
]);
const cold = rounds[0].find(result => result.name === 'verify');
const warm = rounds[1].find(result => result.name === 'verify');
const evidence = {
  status:
    rounds.flat().every(result => result.status === 'pass') &&
    postgresBefore.output === postgresAfter.output &&
    forgejo.output === '200' &&
    warm.durationMs < cold.durationMs
      ? 'pass'
      : 'fail',
  startedAt,
  cacheDir,
  availableGiB: Number(availableGiB.toFixed(1)),
  postgresBefore,
  postgresAfter,
  forgejo,
  rounds,
  warmImprovementPercent: Number((100 * (1 - warm.durationMs / cold.durationMs)).toFixed(1)),
};
writeJson(path.join(evidenceDir, 'benchmark.json'), evidence);
console.log(JSON.stringify({ status: evidence.status, evidenceDir }));
if (evidence.status !== 'pass') process.exitCode = 1;
