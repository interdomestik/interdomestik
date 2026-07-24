#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Z620_EXECUTABLES } from './managed-executables.mjs';
import {
  acquireLaneLock,
  captureCommand,
  checksumEvidence,
  createRun,
  materializeClone,
  validateParity,
  writeJson,
} from './z620-runner-lib.mjs';
import { validateGateCommandIds } from './z620-gate-command-lib.mjs';
import { validateGateCoverage, validateWorkflowDigests } from './z620-parity-lib.mjs';
import { resolveRunsRoot, resolveStateRoot } from './z620-resource-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(
  process.argv.slice(2).map(argument => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key, value.join('=') || true];
  })
);
const lane = String(args.lane || 'verify');
const sha = String(
  args.sha ||
    execFileSync(Z620_EXECUTABLES.git, ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
);
const runsRoot = resolveRunsRoot(args['runs-root'], root);
const stateRoot = resolveStateRoot(args['state-root'], root);
const parity = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json'), 'utf8'));
const gates = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-gates.json'), 'utf8'));

const problems = [
  ...validateParity(root, parity),
  ...validateWorkflowDigests(root, parity),
  ...validateGateCoverage(parity, gates),
  ...validateGateCommandIds(gates),
];
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const releaseLock = acquireLaneLock(stateRoot, lane);
let runDir;
try {
  const run = createRun(runsRoot, sha, lane);
  runDir = run.runDir;
  const cloneDir = path.join(runDir, 'worktree', 'repo');
  materializeClone(root, cloneDir, sha);
  const manifest = {
    schemaVersion: 1,
    runId: run.runId,
    lane,
    sha,
    branch: execFileSync(Z620_EXECUTABLES.git, ['-C', root, 'branch', '--show-current'], {
      encoding: 'utf8',
    }).trim(),
    sourceDirty: Boolean(
      execFileSync(Z620_EXECUTABLES.git, ['-C', root, 'status', '--porcelain'], {
        encoding: 'utf8',
      }).trim()
    ),
    materializedClean: true,
    hostname: os.hostname(),
    platform: `${os.platform()}-${os.arch()}`,
    node: process.version,
    startedAt: new Date().toISOString(),
    providerMode: 'disabled',
  };
  const parityEvidence = {
    status: 'pass',
    workflows: parity.workflows,
    workflowDigests: parity.workflowDigests,
    jobCoverage: gates.jobCoverage,
    lanes: Object.keys(gates.lanes).sort((left, right) => left.localeCompare(right)),
    requiredSecretNames: parity.requiredSecretNames,
  };
  const results = {
    status: 'pass',
    mode: 'no-provider-dry-run',
    checks: ['exact-clean-sha', 'workflow-parity', 'evidence-checksums'],
  };
  const baseline = {
    hostnamectl: captureCommand(Z620_EXECUTABLES.hostnamectl),
    cpu: captureCommand(Z620_EXECUTABLES.lscpu),
    numa: captureCommand(Z620_EXECUTABLES.numactl, ['--hardware']),
    memory: captureCommand(Z620_EXECUTABLES.free, ['-h']),
    disk: captureCommand(Z620_EXECUTABLES.df, ['-h', '/']),
    listeners: captureCommand(Z620_EXECUTABLES.ss, ['-ltn']),
    containers: captureCommand(Z620_EXECUTABLES.docker, [
      'ps',
      '--format',
      '{{.Names}} {{.Status}} {{.Ports}}',
    ]),
    postgres: captureCommand(Z620_EXECUTABLES.docker, [
      'exec',
      'supabase_db_interdomestik',
      'pg_isready',
      '-U',
      'postgres',
    ]),
    ntfsMounts: captureCommand(Z620_EXECUTABLES.findmnt, ['--types', 'ntfs,ntfs3', '--noheadings']),
  };
  writeJson(path.join(runDir, 'manifest.json'), manifest);
  writeJson(path.join(runDir, 'parity.json'), parityEvidence);
  writeJson(path.join(runDir, 'results.json'), results);
  writeJson(path.join(runDir, 'baseline.json'), baseline);
  checksumEvidence(runDir, ['baseline.json', 'manifest.json', 'parity.json', 'results.json']);
  console.log(JSON.stringify({ runDir, runId: run.runId, status: 'pass' }));
} finally {
  releaseLock();
}
