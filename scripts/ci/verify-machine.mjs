#!/usr/bin/env node
// First and last step of `pnpm pr:verify` and `pnpm security:guard` (AGENTS.md R-04).
// `begin` labels the run GATE-EVIDENCE only when the owner's root-owned marker matches this
// machine; otherwise the run is a PRE-CHECK that prints why (owner 2026-11-19: a run that does
// not match is downgraded, not stopped). An untrusted marker still stops the run. `stamp` runs
// only after every step passed, in the same shell as its `begin` (one pending record per shell
// process and lane; see verify-machine-stamp.mjs). Gate mode also requires both steps to run
// inside the unchanged pnpm chain (verify-machine-chain.mjs).
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chainErrors, defaultChainProbe, LANE_SCRIPTS } from './verify-machine-chain.mjs';
import { compareMachine } from './verify-machine-compare.mjs';
import { describeMachine } from './verify-machine-describe.mjs';
import { unexpectedEnvNames } from './verify-machine-env-names.mjs';
import {
  fail,
  logPreCheck,
  nameList,
  ONLY_ISOLATED_CHILDREN,
  PREFIX,
} from './verify-machine-output.mjs';
import { gitState, probeMachine, runCommand } from './verify-machine-probe.mjs';
import * as records from './verify-machine-records.mjs';
import { probeLive, rootErrors, stampRun } from './verify-machine-stamp.mjs';
import { readTrustedMarker } from './verify-machine-trust.mjs';
import {
  DISPATCH_DIR_ENV,
  ExpiredGrantError,
  QUEUE_SCOPE_ENV,
  stampRefusalLine,
  verifyStampComposition,
} from './verification-evidence/m4-dispatch.mjs';
import { M4_SCRIPT } from './verification-evidence/manifest.mjs';

const USAGE = 'usage: verify-machine.mjs begin|stamp <pr-verify|security-guard> | describe';

export function defaultDependencies() {
  return {
    env: process.env,
    platform: process.platform,
    cwd: process.cwd(),
    permissionModel: Boolean(process.permission),
    shellPid: process.ppid,
    shellStart: () => records.readShellStart(process.ppid),
    chain: defaultChainProbe(process.ppid),
    exec: runCommand,
    readMarker: readTrustedMarker,
    verifyComposition: verifyStampComposition,
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

// The shell is its PID and its start time: a later shell that reuses the PID gets its own record
// path. Without a start time a `begin` is a pre-check (see rootErrors) and its `stamp` fails.
function shellIdentity(deps) {
  let start = null;
  try {
    start = deps.shellStart()?.trim() || null;
  } catch {
    start = null;
  }
  return { pid: deps.shellPid, start, id: `${deps.shellPid}@${start ?? 'unknown'}` };
}

function pendingBase(lane, deps, shell, startedAt) {
  return {
    version: records.PENDING_VERSION,
    lane,
    runId: deps.newRunId(),
    shellPid: shell.pid,
    shellStart: shell.start,
    startedAt,
  };
}

function preCheck(lane, deps, context, reason, problems = []) {
  const { repoRoot, pendingPath, shell, startedAt } = context;
  logPreCheck(deps, reason, problems);
  try {
    // An older record of this shell and lane (an interrupted run, or a reused PID) must never be
    // finished by this run, even when the new record cannot be written.
    deps.records.removeRecord(pendingPath);
    const git = deps.gitState(repoRoot, deps.exec);
    deps.records.writeRecord(pendingPath, {
      ...pendingBase(lane, deps, shell, startedAt),
      mode: records.MODES.preCheck,
      head: git.head,
      cleanTree: git.clean,
      platform: deps.platform,
      node: process.version,
      reasons: problems,
    });
  } catch (error) {
    deps.error(`${PREFIX} pre-check record not written (${error?.code ?? 'error'}); continuing.`);
  }
  return 0;
}

function begin(lane, deps, repoRoot, shell) {
  const directory = deps.records.recordDirectory({ platform: deps.platform });
  const pendingPath = deps.records.pendingRecordPath(directory, repoRoot, lane, shell.id);
  deps.records.pruneStalePending(directory, Date.parse(deps.now()));
  const context = { repoRoot, pendingPath, shell, startedAt: deps.now() };
  const downgrade = (reason, problems = []) =>
    deps.composed
      ? fail(deps, [reason, ...problems])
      : preCheck(lane, deps, context, reason, problems);
  const markerResult = deps.readMarker();
  if (markerResult.status === 'absent') return downgrade('no verification-machine marker');
  if (deps.platform !== 'darwin') return downgrade('a marker is present on a non-macOS host');
  const { marker, sha256 } = markerResult;
  const roleProblems = records.gateRoleErrors(marker);
  if (roleProblems.length > 0) return downgrade('machine role refused', roleProblems);
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
  let composition;
  let runId;
  if (deps.composed) {
    try {
      ({ scope: composition, runId } = deps.verifyComposition(
        repoRoot,
        deps.env,
        'dispatch',
        lane
      ));
      if (composition.markerSha256 !== sha256 || composition.head !== live.git.head) {
        return fail(deps, ['the M4 stamp scope differs from the verified evidence']);
      }
    } catch (error) {
      if (error instanceof ExpiredGrantError) deps.log(stampRefusalLine(lane, error.runIds[lane]));
      return fail(deps, ['M4 composed evidence was refused at begin']);
    }
  }
  const mode = composition?.method === 'composed-trial' ? records.MODES.trial : records.MODES.gate;
  deps.records.writeRecord(pendingPath, {
    ...pendingBase(lane, deps, shell, context.startedAt),
    ...(runId ? { runId } : {}),
    mode,
    head: live.git.head,
    cleanTree: true,
    markerSha256: sha256,
    ...records.gateRecordRole(marker, composition),
    configuration: records.recordedConfiguration(marker, live),
  });
  deps.log(`${PREFIX} ${mode} candidate: machine matches marker ${sha256.slice(0, 12)}.`);
  return 0;
}

function usageErrors(command, lane, argv) {
  if (!['begin', 'stamp'].includes(command) || !records.LANES.includes(lane)) return [USAGE];
  if (argv.length === 2) return [];
  // pnpm appends `pnpm pr:verify <arguments>` to the chain's last step, which is this one.
  return [
    `pnpm ${LANE_SCRIPTS[lane]} takes no arguments; they would reach this step, not a test.`,
    'Run a step with its own arguments directly, for example',
    'node scripts/run-with-default-db-url.mjs pnpm e2e:smoke --list',
  ];
}

function beginVerification(lane, deps, exceptional) {
  if (exceptional === 'hosted') {
    deps.log(
      `${PREFIX} hosted run: the machine marker does not apply; hosted checks count apart; ` +
        `${ONLY_ISOLATED_CHILDREN}.`
    );
    return 0;
  }
  if (exceptional) {
    deps.log(
      `${PREFIX} PRE-CHECK lane=${lane}: variables a gate run does not take are set ` +
        `(${nameList(exceptional)}); ${ONLY_ISOLATED_CHILDREN}.`
    );
    return 0;
  }
  let repoRoot;
  try {
    repoRoot = deps.exec('git', ['rev-parse', '--show-toplevel'], deps.cwd);
  } catch {
    if (deps.composed) return fail(deps, ['composed verification requires a repository checkout']);
    deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no git repository found; nothing is recorded.`);
    return 0;
  }
  const shell = shellIdentity(deps);
  return begin(lane, { ...deps, shellKnown: shell.start !== null }, repoRoot, shell);
}

export function runVerifyMachine(argv, deps = defaultDependencies()) {
  // Under Node's permission model a child can receive variables the verifier did not give it.
  if (deps.permissionModel) {
    return fail(deps, ['the verifier does not run under the Node permission model']);
  }
  const [command, lane] = argv;
  const unexpected = unexpectedEnvNames(deps.env);
  const composed =
    deps.env.npm_lifecycle_event === M4_SCRIPT ||
    Object.hasOwn(deps.env, DISPATCH_DIR_ENV) ||
    Object.hasOwn(deps.env, QUEUE_SCOPE_ENV);
  if (command === 'describe') {
    if (unexpected.length === 0) return describeMachine(argv.slice(1), deps);
    return fail(deps, [
      `describe runs only in the gate environment; unset ${nameList(unexpected)}`,
    ]);
  }
  const usage = usageErrors(command, lane, argv);
  if (usage.length > 0) return fail(deps, usage);
  // An untrusted marker stops the run in either phase, before anything else is honoured. Its check
  // starts only `ls`, with an empty environment, so it runs in any shell.
  const markerResult = deps.readMarker();
  if (markerResult.status === 'invalid') {
    return fail(deps, ['the verification marker is not trusted:', ...markerResult.errors]);
  }
  const hosted = deps.env.GITHUB_ACTIONS === 'true';
  let exceptional = null;
  if (hosted) exceptional = 'hosted';
  else if (unexpected.length > 0) exceptional = unexpected;
  if (composed && (exceptional || !deps.env[DISPATCH_DIR_ENV] || !deps.env[QUEUE_SCOPE_ENV])) {
    return fail(deps, ['composed verification requires an M4 dispatcher grant and queued scope']);
  }
  const run = { ...deps, composed, readMarker: () => markerResult };
  if (command === 'stamp') return stampRun(lane, run, shellIdentity(deps), exceptional);
  return beginVerification(lane, run, exceptional);
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
