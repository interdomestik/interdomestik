#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z620_EXECUTABLES } from './managed-executables.mjs';
import { availableMemoryGiB, hasFullWarmHit, turboCacheSummary } from './z620-benchmark-lib.mjs';
import { captureCommand, redact, safeId, writeJson } from './z620-runner-lib.mjs';
import {
  prepareCacheNamespace,
  prepareEvidenceSubdirectory,
  resolveEvidenceDirectory,
} from './z620-resource-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
const evidenceDir = resolveEvidenceDirectory(args['evidence-dir'], root);
const cacheDir = prepareCacheNamespace(args['cache-root'], namespace, root);
const logsDir = prepareEvidenceSubdirectory(evidenceDir, 'logs', root);

const availableGiB = availableMemoryGiB();
if (availableGiB < 12)
  throw new Error(`P4 requires 12 GiB available; found ${availableGiB.toFixed(1)}`);
const postgresBefore = captureCommand(Z620_EXECUTABLES.docker, [
  'inspect',
  '-f',
  '{{.State.Health.Status}}/{{.RestartCount}}',
  'supabase_db_interdomestik',
]);

function runTask(name, cpuList, commandArgs, round) {
  const started = Date.now();
  const child = spawn(
    Z620_EXECUTABLES.taskset,
    ['--cpu-list', cpuList, Z620_EXECUTABLES.pnpm, ...commandArgs],
    {
      env: {
        ...process.env,
        NEXT_BUILD_CPUS: '6',
        PLAYWRIGHT_WORKERS: '6',
        TURBO_CONCURRENCY: '6',
        VITEST_MAX_WORKERS: '6',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  child.stdout.on('data', chunk => (output += chunk));
  child.stderr.on('data', chunk => (output += chunk));
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => {
      const log = `round-${round}-${name}.log`;
      fs.writeFileSync(path.join(logsDir, log), redact(output), { flag: 'wx', mode: 0o600 });
      resolve({
        name,
        cpuList,
        status: code === 0 ? 'pass' : 'fail',
        exitCode: code ?? 1,
        durationMs: Date.now() - started,
        cacheSummary: turboCacheSummary(output),
        log: `logs/${log}`,
      });
    });
  });
}

async function runRound(round) {
  const verify = runTask(
    'verify',
    '0-5,12-17',
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
    ['--filter', '@interdomestik/web', 'run', 'e2e:guards'],
    round
  );
  return Promise.all([verify, e2ePrep]);
}

const startedAt = new Date().toISOString();
const rounds = [await runRound(1), await runRound(2)];
const postgresAfter = captureCommand(Z620_EXECUTABLES.docker, [
  'inspect',
  '-f',
  '{{.State.Health.Status}}/{{.RestartCount}}',
  'supabase_db_interdomestik',
]);
const forgejo = captureCommand(Z620_EXECUTABLES.curl, [
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
    hasFullWarmHit(warm.cacheSummary) &&
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
writeJson(path.join(evidenceDir, 'benchmark.json'), evidence, { exclusive: true });
console.log(JSON.stringify({ status: evidence.status, evidenceDir }));
if (evidence.status !== 'pass') process.exitCode = 1;
