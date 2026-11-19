// `stamp`: finds this shell's run only through the shell-and-lane lookup, then re-checks and
// publishes the run's one final record. On the hosted shortcut and outside the clean environment
// it cannot check a run, so a begin record of this shell fails it (fail closed).
import { chainErrors } from './verify-machine-chain.mjs';
import { compareMachine } from './verify-machine-compare.mjs';
import {
  fail,
  logPreCheck,
  nameList,
  ONLY_ISOLATED_CHILDREN,
  PREFIX,
} from './verify-machine-output.mjs';
import { MODES, PENDING_VERSION } from './verify-machine-records.mjs';

export function probeLive(deps, repoRoot, marker) {
  try {
    return deps.probe({ repoRoot, marker, env: deps.env, exec: deps.exec });
  } catch {
    return null;
  }
}

// The lane runs in its package root; git settings must not point the checks at another checkout.
// Its records are bound to its shell, which needs a known start time.
export function rootErrors(deps, repoRoot) {
  const errors = deps.shellKnown ? [] : ['the start time of this shell could not be read'];
  try {
    if (deps.realpath(repoRoot) === deps.realpath(deps.cwd)) return errors;
  } catch {
    return [...errors, 'the repository root could not be resolved'];
  }
  return [...errors, 'the checked repository is not the checkout running the lane'];
}

// Publication needs a readable HEAD equal to the recorded one, in every mode.
function headProblems(deps, repoRoot, pending) {
  let head;
  try {
    head = deps.exec('git', ['rev-parse', 'HEAD'], repoRoot);
  } catch {
    return ['HEAD could not be read; not stamped'];
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
  const record = { ...pending, finishedAt: deps.now(), result: 'passed' };
  const finalPath = deps.records.finalRecordPath(directory, record);
  const warn = error =>
    deps.error(`${PREFIX} temporary record not removed (${error?.code ?? 'error'}); continuing.`);
  let recordSha256;
  try {
    recordSha256 = deps.records.publishRecord(finalPath, record, warn);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return fail(deps, [`run ${record.runId} already has a final record`]);
    }
    // A pre-check record is optional: a full disk must not fail a command that passed. Without
    // its record a gate run has no evidence, so the command fails.
    if (record.mode === MODES.gate) throw error;
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

function finish(lane, deps, repoRoot, match, directory) {
  const { record: pending, path: pendingPath } = match;
  const moved = headProblems(deps, repoRoot, pending);
  if (moved.length > 0) return fail(deps, moved);
  if (pending.mode !== MODES.gate) {
    return writeFinalRecord(lane, deps, pending, pendingPath, directory);
  }
  const markerResult = deps.readMarker();
  const problems = gateProblems(lane, deps, repoRoot, pending, markerResult);
  if (problems.length === 0) return writeFinalRecord(lane, deps, pending, pendingPath, directory);
  if (problems.includes('HEAD changed during the run')) return fail(deps, problems);
  logPreCheck(deps, 'the run stopped matching the verification marker', problems);
  const { markerSha256, configuration, ...unmarked } = pending;
  const downgraded = { ...unmarked, mode: MODES.preCheck, reasons: problems };
  return writeFinalRecord(lane, deps, downgraded, pendingPath, directory);
}

// The hosted shortcut and the unexpected-variable pre-check cannot check a run, so a begin record
// of this shell fails them.
function exceptionalStamp(lane, deps, matches, exceptional) {
  const hosted = exceptional === 'hosted';
  const reason = hosted ? 'GITHUB_ACTIONS=true' : nameList(exceptional);
  if (matches.length > 0) {
    return fail(deps, [`a begin record of this shell cannot be checked with ${reason} set`]);
  }
  deps.log(
    hosted
      ? `${PREFIX} hosted run: the machine marker does not apply; hosted checks count apart.`
      : `${PREFIX} PRE-CHECK lane=${lane}: variables a gate run does not take are set ` +
          `(${reason}); ${ONLY_ISOLATED_CHILDREN}.`
  );
  return 0;
}

/** `exceptional`: `hosted` (GITHUB_ACTIONS) or the unexpected variable names, or null. */
export function stampRun(lane, deps, shell, exceptional) {
  const directory = deps.records.recordDirectory({ platform: deps.platform });
  let matches;
  try {
    matches = deps.records.shellPendingRecords(directory, lane, shell);
  } catch {
    return fail(deps, ["this shell's pending records could not be read; not stamped"]);
  }
  if (exceptional) return exceptionalStamp(lane, deps, matches, exceptional);
  let repoRoot;
  try {
    repoRoot = deps.exec('git', ['rev-parse', '--show-toplevel'], deps.cwd);
  } catch {
    if (matches.length > 0) return fail(deps, ["this shell's begin has no git repository here"]);
    deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no git repository found; nothing is recorded.`);
    return 0;
  }
  if (matches.length === 0) {
    deps.log(`${PREFIX} PRE-CHECK lane=${lane}: no begin record in this shell; nothing recorded.`);
    return 0;
  }
  const [match] = matches;
  if (matches.length === 1 && match.record.version !== PENDING_VERSION) {
    return fail(deps, ['this run began under an older verifier; rerun the lane']);
  }
  const exactPath = deps.records.pendingRecordPath(directory, repoRoot, lane, shell.id);
  const known = Boolean(shell.start) && Boolean(match.record.shellStart);
  if (matches.length !== 1 || match.path !== exactPath || !known) {
    return fail(deps, ["this shell's begin cannot be matched to this checkout; not stamped"]);
  }
  const run = { ...deps, shellKnown: true };
  return finish(lane, run, repoRoot, match, directory);
}
