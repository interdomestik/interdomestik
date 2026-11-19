#!/usr/bin/env node
// First and last step of `pnpm pr:verify` and `pnpm security:guard` (AGENTS.md R-04).
// `begin` labels the run GATE-EVIDENCE only when the owner's root-owned marker matches this
// machine; otherwise the run is a PRE-CHECK that prints why (owner 2026-11-19: a run that does
// not match is downgraded, not stopped). An untrusted marker still stops the run. `stamp` runs
// only after every step passed, in the same shell as its `begin` (one pending record per shell
// process and lane). Gate mode also requires both steps to run inside the unchanged pnpm chain
// (verify-machine-chain.mjs).
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chainErrors, defaultChainProbe, LANE_SCRIPTS } from './verify-machine-chain.mjs';
import { compareMachine } from './verify-machine-compare.mjs';
import { describeMachine } from './verify-machine-describe.mjs';
import { unexpectedEnvNames } from './verify-machine-env-names.mjs';
import { gitState, probeMachine, runCommand } from './verify-machine-probe.mjs';
import * as records from './verify-machine-records.mjs';
import { readTrustedMarker } from './verify-machine-trust.mjs';

const PREFIX = '[verify-machine]';
const USAGE = 'usage: verify-machine.mjs begin|stamp <pr-verify|security-guard> | describe';

// Names only, never values; a long list is cut after the first eight.
function nameList(names) {
  const shown = names.slice(0, 8).join(', ');
  return names.length > 8 ? `${shown} and ${names.length - 8} more` : shown;
}

export function defaultDependencies() {
  return {
    env: process.env,
    platform: process.platform,
    cwd: process.cwd(),
    shellPid: process.ppid,
    shellStart: () => runCommand('ps', ['-o', 'lstart=', '-p', String(process.ppid)]),
    chain: defaultChainProbe(process.ppid),
    exec: runCommand,
    readMarker: readTrustedMarker,
    probe: probeMachine,
    gitState,
    realpath: realpathSync,
    records,
    now: () => new Date().toISOString(),
    newRunId: () => randomUUID(),
    log: message => console.log(message),
    error: message => console.error(message),
  };
}

function fail(deps, lines) {
  for (const line of lines) deps.error(`${PREFIX} ${line}`);
  return 1;
}

function logPreCheck(deps, reason, problems = []) {
  deps.log(`${PREFIX} PRE-CHECK: ${reason}; this run is not gate evidence.`);
  for (const problem of problems) deps.log(`${PREFIX}   - ${problem}`);
}

// The shell is its PID and its start time: a later shell that reuses the PID gets its own record
// path, so it can never finish an older shell's record, even when removing that record fails.
// Without a start time the run is a pre-check (see rootErrors).
function shellIdentity(deps) {
  let start = '';
  try {
    start = deps.shellStart().trim();
  } catch {
    start = '';
  }
  return { id: `${deps.shellPid}@${start || 'unknown'}`, known: start !== '' };
}

function preCheck(lane, deps, repoRoot, pendingPath, startedAt, reason, problems = []) {
  logPreCheck(deps, reason, problems);
  try {
    // An older record of this shell and lane (an interrupted run, or a reused PID) must never be
    // finished by this run, even when the new record cannot be written.
    deps.records.removeRecord(pendingPath);
    const git = deps.gitState(repoRoot, deps.exec);
    deps.records.writeRecord(pendingPath, {
      lane,
      runId: deps.newRunId(),
      shellPid: deps.shellPid,
      mode: records.MODES.preCheck,
      head: git.head,
      cleanTree: git.clean,
      startedAt,
      platform: deps.platform,
      node: process.version,
      reasons: problems,
    });
  } catch (error) {
    deps.error(`${PREFIX} pre-check record not written (${error?.code ?? 'error'}); continuing.`);
  }
  return 0;
}

function probeLive(deps, repoRoot, marker) {
  try {
    return deps.probe({ repoRoot, marker, env: deps.env, exec: deps.exec });
  } catch {
    return null;
  }
}

// The lane runs in its package root; git settings must not point the checks at another checkout.
// Its records are bound to its shell, which needs a known start time.
function rootErrors(deps, repoRoot) {
  const errors = deps.shellKnown ? [] : ['the start time of this shell could not be read'];
  try {
    if (deps.realpath(repoRoot) === deps.realpath(deps.cwd)) return errors;
  } catch {
    return [...errors, 'the repository root could not be resolved'];
  }
  return [...errors, 'the checked repository is not the checkout running the lane'];
}

function begin(lane, deps, repoRoot, pendingPath) {
  const markerResult = deps.readMarker();
  const startedAt = deps.now();
  const downgrade = (reason, problems) =>
    preCheck(lane, deps, repoRoot, pendingPath, startedAt, reason, problems);
  if (markerResult.status === 'absent') return downgrade('no verification-machine marker');
  if (deps.platform !== 'darwin') return downgrade('a marker is present on a non-macOS host');
  const { marker, sha256 } = markerResult;
  const live = probeLive(deps, repoRoot, marker);
  if (!live) return downgrade('this machine could not be probed');
  const problems = [
    ...rootErrors(deps, repoRoot),
    ...chainErrors(lane, { ...deps, repoRoot }),
    ...compareMachine(marker, live),
  ];
  if (problems.length > 0) {
    return downgrade('this run does not match the verification marker', problems);
  }
  deps.records.writeRecord(pendingPath, {
    lane,
    runId: deps.newRunId(),
    shellPid: deps.shellPid,
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

// HEAD must not move in either mode; an unreadable repository leaves it to the gate re-check.
function headProblems(deps, repoRoot, pending) {
  let head;
  try {
    // HEAD alone: a failing `git status` must not hide a moved HEAD.
    head = deps.exec('git', ['rev-parse', 'HEAD'], repoRoot);
  } catch {
    return [];
  }
  return head === pending.head ? [] : ['HEAD changed during the run'];
}

function gateProblems(lane, deps, repoRoot, pending, markerResult) {
  const problems = [...rootErrors(deps, repoRoot), ...chainErrors(lane, { ...deps, repoRoot })];
  if (markerResult.status !== 'trusted' || markerResult.sha256 !== pending.markerSha256) {
    return [...problems, 'the verification marker changed during the run'];
  }
  const live = probeLive(deps, repoRoot, markerResult.marker);
  if (!live) return [...problems, 'this machine could not be probed'];
  problems.push(...compareMachine(markerResult.marker, live, { phase: 'stamp' }));
  if (live.git.head !== pending.head) problems.push('HEAD changed during the run');
  return problems;
}

function writeFinalRecord(lane, deps, pending, pendingPath, directory) {
  const runId = pending.runId ?? deps.newRunId();
  const record = { ...pending, runId, finishedAt: deps.now(), result: 'passed' };
  const finalPath = deps.records.finalRecordPath(directory, record);
  let recordSha256;
  try {
    recordSha256 = deps.records.publishRecord(finalPath, record);
  } catch (error) {
    if (error?.code === 'EEXIST') return fail(deps, [`run ${runId} already has a final record`]);
    // A pre-check record is optional: a full disk must not fail a command that passed. Without
    // its record a gate run has no evidence, so the command fails.
    if (record.mode === records.MODES.gate) throw error;
    deps.error(`${PREFIX} pre-check record not written (${error?.code ?? 'error'}); continuing.`);
    return 0;
  }
  // The final record is the decision; removing the pending file is cleanup that cannot undo it. A
  // pending file left behind cannot be finished again: its final record already exists.
  try {
    deps.records.removeRecord(pendingPath);
  } catch (error) {
    deps.error(`${PREFIX} pending record not removed (${error?.code ?? 'error'}); continuing.`);
  }
  // The evidence line starts with its mode, with no prefix: `GATE-EVIDENCE lane=…` or `PRE-CHECK …`.
  deps.log(
    `${record.mode} lane=${lane} head=${record.head} ` +
      `marker=${record.markerSha256 ?? 'none'} record=${finalPath} record_sha256=${recordSha256}`
  );
  return 0;
}

function stamp(lane, deps, repoRoot, pendingPath, directory) {
  const markerResult = deps.readMarker();
  const pending = deps.records.readRecord(pendingPath);
  if (!pending || pending.lane !== lane) {
    deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no begin record in this shell; nothing recorded.`);
    return 0;
  }
  const moved = headProblems(deps, repoRoot, pending);
  if (moved.length > 0) return fail(deps, moved);
  if (pending.mode !== records.MODES.gate) {
    return writeFinalRecord(lane, deps, pending, pendingPath, directory);
  }
  const problems = gateProblems(lane, deps, repoRoot, pending, markerResult);
  if (problems.length === 0) return writeFinalRecord(lane, deps, pending, pendingPath, directory);
  if (problems.includes('HEAD changed during the run')) return fail(deps, problems);
  logPreCheck(deps, 'the run stopped matching the verification marker', problems);
  const { markerSha256, configuration, ...unmarked } = pending;
  const downgraded = { ...unmarked, mode: records.MODES.preCheck, reasons: problems };
  return writeFinalRecord(lane, deps, downgraded, pendingPath, directory);
}

export function runVerifyMachine(argv, deps = defaultDependencies()) {
  const [command, lane] = argv;
  if (command === 'describe') {
    const unexpected = unexpectedEnvNames(deps.env);
    if (unexpected.length === 0) return describeMachine(argv.slice(1), deps);
    return fail(deps, [
      `describe runs only in the gate environment; unset ${nameList(unexpected)}`,
    ]);
  }
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
  // An untrusted marker stops the run in either phase, before anything else is honoured. Its check
  // starts only `ls`, with an empty environment, so it runs in any shell.
  const markerResult = deps.readMarker();
  if (markerResult.status === 'invalid') {
    return fail(deps, ['the verification marker is not trusted:', ...markerResult.errors]);
  }
  if (deps.env.GITHUB_ACTIONS === 'true') {
    deps.log(`${PREFIX} hosted run: the machine marker does not apply; hosted checks count apart.`);
    return 0;
  }
  // Outside the closed gate environment no command starts, so none can print its environment.
  // A stamp whose shell holds a begin record cannot check HEAD without one, so it fails.
  const directory = deps.records.recordDirectory({ platform: deps.platform, env: deps.env });
  const unexpected = unexpectedEnvNames(deps.env);
  if (unexpected.length > 0) {
    if (command === 'stamp' && deps.records.shellHasPending(directory, lane, deps.shellPid)) {
      return fail(deps, [
        `variables were added after begin (${nameList(unexpected)}); not stamped`,
      ]);
    }
    deps.log(
      `${PREFIX} PRE-CHECK lane=${lane}: variables a gate run does not take are set ` +
        `(${nameList(unexpected)}); only the marker was checked, nothing else ran or was recorded.`
    );
    return 0;
  }
  let repoRoot;
  try {
    repoRoot = deps.exec('git', ['rev-parse', '--show-toplevel'], deps.cwd);
  } catch {
    deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no git repository found; nothing is recorded.`);
    return 0;
  }
  const shell = shellIdentity(deps);
  const run = { ...deps, shellKnown: shell.known, readMarker: () => markerResult };
  const pendingPath = deps.records.pendingRecordPath(directory, repoRoot, lane, shell.id);
  if (command === 'begin') deps.records.pruneStalePending(directory, Date.parse(deps.now()));
  return command === 'begin'
    ? begin(lane, run, repoRoot, pendingPath)
    : stamp(lane, run, repoRoot, pendingPath, directory);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = runVerifyMachine(process.argv.slice(2));
  } catch (error) {
    // A fixed diagnostic: an error message can carry a command's output or environment.
    console.error(`${PREFIX} stopped (${error?.code ?? error?.name ?? 'error'}).`);
    process.exitCode = 1;
  }
}
