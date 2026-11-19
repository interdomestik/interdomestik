#!/usr/bin/env node
// First and last step of `pnpm pr:verify` and `pnpm security:guard` (AGENTS.md R-04).
// `begin` labels the run GATE-EVIDENCE only when the owner's root-owned marker matches this
// machine; without a marker the run is a PRE-CHECK. `stamp` runs only after every step passed,
// in the same shell as its `begin` (one pending record per shell process and lane). Gate mode
// also requires both steps to run inside the unchanged pnpm chain (verify-machine-chain.mjs).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chainErrors, defaultChainProbe, LANE_SCRIPTS } from './verify-machine-chain.mjs';
import { compareMachine } from './verify-machine-compare.mjs';
import { describeMachine } from './verify-machine-describe.mjs';
import { gitState, probeMachine, runCommand } from './verify-machine-probe.mjs';
import * as records from './verify-machine-records.mjs';
import { readTrustedMarker } from './verify-machine-trust.mjs';

const PREFIX = '[verify-machine]';
const USAGE = 'usage: verify-machine.mjs begin|stamp <pr-verify|security-guard> | describe';

export function defaultDependencies() {
  return {
    env: process.env,
    platform: process.platform,
    cwd: process.cwd(),
    shellPid: process.ppid,
    chain: defaultChainProbe(process.ppid),
    exec: runCommand,
    readMarker: readTrustedMarker,
    probe: probeMachine,
    gitState,
    records,
    now: () => new Date().toISOString(),
    log: message => console.log(message),
    error: message => console.error(message),
  };
}

function fail(deps, lines) {
  for (const line of lines) deps.error(`${PREFIX} ${line}`);
  return 1;
}

function begin(lane, deps, repoRoot, pendingPath) {
  const markerResult = deps.readMarker();
  const startedAt = deps.now();
  if (markerResult.status === 'invalid') {
    return fail(deps, ['the verification marker is not trusted:', ...markerResult.errors]);
  }
  if (markerResult.status === 'absent') {
    deps.log(`${PREFIX} PRE-CHECK: no verification-machine marker; this run is not gate evidence.`);
    try {
      const git = deps.gitState(repoRoot, deps.exec);
      deps.records.writeRecord(pendingPath, {
        lane,
        mode: records.MODES.preCheck,
        head: git.head,
        cleanTree: git.clean,
        startedAt,
        platform: deps.platform,
        node: process.version,
      });
    } catch (error) {
      deps.error(`${PREFIX} pre-check record not written (${error?.code ?? 'error'}); continuing.`);
    }
    return 0;
  }
  if (deps.platform !== 'darwin') return fail(deps, ['a marker is present on a non-macOS host']);
  const { marker, sha256 } = markerResult;
  const live = deps.probe({ repoRoot, marker, env: deps.env, exec: deps.exec });
  const problems = [...chainErrors(lane, { ...deps, repoRoot }), ...compareMachine(marker, live)];
  if (problems.length > 0) {
    return fail(deps, ['this run does not match the verification marker:', ...problems]);
  }
  deps.records.writeRecord(pendingPath, {
    lane,
    mode: records.MODES.gate,
    head: live.git.head,
    cleanTree: true,
    startedAt,
    markerSha256: sha256,
    configuration: records.recordedConfiguration(marker, live),
  });
  deps.log(`${PREFIX} GATE-EVIDENCE candidate: machine matches marker ${sha256.slice(0, 12)}.`);
  return 0;
}

// A pre-check only notes HEAD; an unreadable repository must not fail a command that passed.
function preCheckProblems(deps, repoRoot, pending) {
  let head;
  try {
    head = deps.gitState(repoRoot, deps.exec).head;
  } catch {
    return [];
  }
  return head === pending.head ? [] : ['HEAD changed during the run'];
}

function gateProblems(lane, deps, repoRoot, pending, markerResult) {
  const problems = chainErrors(lane, { ...deps, repoRoot });
  if (markerResult.status !== 'trusted' || markerResult.sha256 !== pending.markerSha256) {
    return [...problems, 'the verification marker changed during the run'];
  }
  const live = deps.probe({
    repoRoot,
    marker: markerResult.marker,
    env: deps.env,
    exec: deps.exec,
  });
  problems.push(...compareMachine(markerResult.marker, live, { phase: 'stamp' }));
  if (live.git.head !== pending.head) problems.push('HEAD changed during the run');
  return problems;
}

function writeFinalRecord(lane, deps, pending, pendingPath, directory) {
  const record = { ...pending, finishedAt: deps.now(), result: 'passed' };
  const finalPath = deps.records.finalRecordPath(directory, record);
  let recordSha256;
  try {
    recordSha256 = deps.records.writeRecord(finalPath, record);
    deps.records.removeRecord(pendingPath);
  } catch (error) {
    // A pre-check record is optional: a full disk must not fail a command that passed.
    if (record.mode === records.MODES.gate) throw error;
    deps.error(`${PREFIX} pre-check record not written (${error?.code ?? 'error'}); continuing.`);
    return 0;
  }
  deps.log(
    `${PREFIX} ${record.mode} lane=${lane} head=${record.head} ` +
      `marker=${record.markerSha256 ?? 'none'} record=${finalPath} record_sha256=${recordSha256}`
  );
  return 0;
}

function stamp(lane, deps, repoRoot, pendingPath, directory) {
  const pending = deps.records.readRecord(pendingPath);
  const markerResult = deps.readMarker();
  if (!pending || pending.lane !== lane) {
    if (markerResult.status === 'absent') {
      deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no begin record; nothing is recorded.`);
      return 0;
    }
    return fail(deps, [`no begin record for ${lane} in this shell; run the whole command again`]);
  }
  const problems =
    pending.mode === records.MODES.gate
      ? gateProblems(lane, deps, repoRoot, pending, markerResult)
      : preCheckProblems(deps, repoRoot, pending);
  if (problems.length > 0) return fail(deps, problems);
  return writeFinalRecord(lane, deps, pending, pendingPath, directory);
}

export function runVerifyMachine(argv, deps = defaultDependencies()) {
  const [command, lane] = argv;
  if (command === 'describe') return describeMachine(argv.slice(1), deps);
  if (!['begin', 'stamp'].includes(command) || !records.LANES.includes(lane)) {
    return fail(deps, [USAGE]);
  }
  if (argv.length !== 2) {
    // pnpm appends `pnpm pr:verify <arguments>` to the chain's last step, which is this one.
    return fail(deps, [
      `pnpm ${LANE_SCRIPTS[lane]} takes no arguments; they would reach this step, not a test.`,
      'Run a step with its own arguments directly, for example',
      'pnpm --filter @interdomestik/web run e2e:smoke --retries=0',
    ]);
  }
  if (deps.env.GITHUB_ACTIONS === 'true') {
    deps.log(`${PREFIX} hosted run: the machine marker does not apply; hosted checks count apart.`);
    return 0;
  }
  let repoRoot;
  try {
    repoRoot = deps.exec('git', ['rev-parse', '--show-toplevel'], deps.cwd);
  } catch {
    if (deps.readMarker().status !== 'absent') return fail(deps, ['no git repository found']);
    deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no git repository found; nothing is recorded.`);
    return 0;
  }
  const directory = deps.records.recordDirectory({ platform: deps.platform, env: deps.env });
  const pendingPath = deps.records.pendingRecordPath(directory, repoRoot, lane, deps.shellPid);
  if (command === 'begin') deps.records.pruneStalePending(directory, Date.parse(deps.now()));
  return command === 'begin'
    ? begin(lane, deps, repoRoot, pendingPath)
    : stamp(lane, deps, repoRoot, pendingPath, directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runVerifyMachine(process.argv.slice(2));
}
