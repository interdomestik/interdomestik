import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MACHINE_ROLES, sha256Hex } from '../verify-machine-marker.mjs';
import { finalRecordPath, LANES, MODES } from '../verify-machine-records.mjs';
import { readBytes } from './bytes.mjs';
import { readApproval, signedDocument, writeArtifact } from './host.mjs';
import {
  assertEvidence,
  checkGitInputs,
  checkQueueJob,
  isRunId,
  isSha256,
  same,
} from './ticket.mjs';

export const DISPATCH_DIR_ENV = 'INTERDOMESTIK_M4_DISPATCH_DIR';
export const QUEUE_SCOPE_ENV = 'INTERDOMESTIK_M4_QUEUE_SCOPE';
const GRANT_CLASS = 'interdomestik.m4-dispatch-grant/1';
const RESULT_CLASS = 'interdomestik.m4-dispatch-result/1';

function isMacJobId(id) {
  return typeof id === 'string' && /^0-\d{19}-[1-9]\d*$/u.test(id);
}

export function checkMacJob(stage, snapshot) {
  if (['dispatch', 'accept', 'finish'].includes(stage)) {
    assertEvidence(isMacJobId(snapshot.macJobId), 'mac-job-identity');
  }
  if (stage === 'finish') assertEvidence(snapshot.dispatcherExit === 0, 'mac-job-finish');
}

export function makeGrant(scope, job, policySha256, checkout) {
  return {
    class: GRANT_CLASS,
    job: checkQueueJob(job),
    policySha256,
    checkout,
    scope: { ...scope, dispatchId: randomUUID() },
    runIds: Object.fromEntries(LANES.map(lane => [lane, randomUUID()])),
  };
}

export function checkGrant(grant, job, approved, now) {
  const expected = checkQueueJob(job);
  const { scope, runIds } = grant ?? {};
  const { repo, subject, attempt, ticketId } = scope ?? {};
  const method = approved.mode === 'trial' ? 'composed-trial' : 'composed';
  assertEvidence(
    grant?.class === GRANT_CLASS &&
      same(grant.job, expected) &&
      typeof grant.checkout === 'string' &&
      path.resolve(grant.checkout) === grant.checkout &&
      same({ repo, subject, attempt, ticketId }, expected) &&
      scope.method === method &&
      isRunId(scope.dispatchId) &&
      isMacJobId(scope.macJobId) &&
      scope.markerSha256 === approved.m4MarkerSha256 &&
      isRunId(scope.m5RunId) &&
      isSha256(scope.m5ReceiptSha256) &&
      isSha256(scope.lockfileSha256) &&
      LANES.every(lane => isRunId(runIds?.[lane])) &&
      Object.keys(runIds).length === LANES.length &&
      new Set(Object.values(runIds)).size === LANES.length &&
      grant.policySha256 === approved.sha256 &&
      Number.isSafeInteger(scope.m5FinishedAt) &&
      scope.m5FinishedAt <= now &&
      Number.isSafeInteger(scope.expiresAt) &&
      now < scope.expiresAt,
    'm4-grant'
  );
  return grant;
}

export function verifyStampComposition(root, env, stage, lane) {
  const approved = readApproval();
  const directory = env[DISPATCH_DIR_ENV];
  assertEvidence(path.resolve(directory) === directory, 'm4-grant-path');
  const { value } = signedDocument(directory, 'grant', 'm4', approved);
  const { scope, runIds, checkout } = checkGrant(
    value,
    JSON.parse(env[QUEUE_SCOPE_ENV]),
    approved,
    Date.now()
  );
  assertEvidence(root === checkout, 'm4-grant-checkout');
  const git = checkGitInputs(
    root,
    {
      head: scope.head,
      tree: scope.tree,
      main: scope.base,
      merge: scope.testedMerge,
    },
    stage === 'dispatch'
  );
  assertEvidence(git.lockfileSha256 === scope.lockfileSha256, 'lockfile-ticket');
  return { scope, runId: runIds[lane] };
}

function composedMode(scope) {
  return scope.method === 'composed-trial' ? MODES.trial : MODES.gate;
}

export function stampRefusalLine(lane, runId) {
  return `M4-STAMP-REFUSED lane=${lane} run=${runId}`;
}

export function observeInvocation(grant) {
  const { scope, runIds } = grant;
  const stamps = new Map();
  let stampRefusals = 0;
  const expected = LANES.map(lane => ({
    lane,
    refusal: stampRefusalLine(lane, runIds[lane]),
    prefix:
      `${composedMode(scope)} lane=${lane} head=${scope.head} run=${runIds[lane]} ` +
      `base=${scope.base} tree=${scope.tree} marker=${scope.markerSha256} record=`,
  }));
  return {
    line(line) {
      for (const { lane, refusal, prefix } of expected) {
        if (line === refusal) stampRefusals += 1;
        if (line.startsWith(prefix)) {
          const digest = /^.+ record_sha256=([a-f0-9]{64})$/u.exec(line.slice(prefix.length))?.[1];
          stamps.set(lane, stamps.has(lane) ? null : digest);
        }
      }
    },
    result: exit => ({ exit, stampRefusals, stamps: new Map(stamps) }),
  };
}

function checkRecordPair(records, grant) {
  const { scope, runIds } = grant;
  const mode = composedMode(scope);
  for (const [index, lane] of LANES.entries()) {
    const { record } = records[index];
    assertEvidence(
      record?.lane === lane &&
        record.mode === mode &&
        record.machineRole === MACHINE_ROLES.m4 &&
        record.result === 'passed' &&
        record.head === scope.head &&
        record.markerSha256 === scope.markerSha256 &&
        record.runId === runIds[lane] &&
        same(record.composition, scope),
      'm4-record'
    );
  }
  const [pr, security] = records.map(({ record }) => record);
  const prStart = Date.parse(pr.startedAt);
  const prFinish = Date.parse(pr.finishedAt);
  const secStart = Date.parse(security.startedAt);
  const secFinish = Date.parse(security.finishedAt);
  assertEvidence(
    pr.runId !== security.runId &&
      scope.m5FinishedAt <= prStart &&
      prStart <= secStart &&
      secStart <= secFinish &&
      secFinish <= prFinish &&
      prFinish < scope.expiresAt,
    'm4-run-pair'
  );
}

function recordNames(directory, grant) {
  return LANES.map(lane =>
    finalRecordPath(directory, { lane, head: grant.scope.head, runId: grant.runIds[lane] })
  );
}

function readRecordPair(directory, grant) {
  const records = recordNames(directory, grant).map(file => {
    const bytes = readBytes(file, 1024 * 1024);
    return { name: path.basename(file), bytes, record: JSON.parse(bytes) };
  });
  checkRecordPair(records, grant);
  const index = records.map(({ name, bytes, record }) => ({
    name,
    recordSha256: sha256Hex(bytes),
    runId: record.runId,
    lane: record.lane,
    mode: record.mode,
    markerSha256: record.markerSha256,
  }));
  return { records, index };
}

export function captureInvocation(directory, grant, { exit, stampRefusals, stamps }, sign) {
  assertEvidence(exit === 0, 'm4-launch-exit');
  const { records, index } = readRecordPair(directory, grant);
  assertEvidence(
    stampRefusals === 0 && index.every(({ lane, recordSha256 }) => stamps.get(lane) === recordSha256),
    'm4-stamp-digest'
  );
  const bytes = Buffer.from(JSON.stringify({ class: RESULT_CLASS, grant, exit, records: index }));
  return { records, bytes, signature: sign(bytes, 'm4') };
}

export function writeInvocation(directory, capture) {
  mkdirSync(directory, { mode: 0o700 });
  for (const { name, bytes } of capture.records) writeArtifact(directory, name, bytes);
  writeArtifact(directory, 'accepted.sig', capture.signature);
  writeArtifact(directory, 'accepted.json', capture.bytes);
}

export function readInvocation(directory, expected, job, approved, now, authenticate) {
  const signed = signedDocument(directory, 'accepted', 'm4', approved, authenticate);
  const capture = signed.value;
  assertEvidence(capture?.class === RESULT_CLASS && capture.exit === 0, 'm4-capture');
  const grant = checkGrant(capture.grant, job, approved, now);
  const scope = { ...expected, dispatchId: grant.scope.dispatchId };
  assertEvidence(scope.method === 'composed' && same(scope, grant.scope), 'm4-capture-scope');
  const { records, index } = readRecordPair(directory, grant);
  assertEvidence(same(index, capture.records), 'm4-capture-pair');
  return { ...signed, records };
}

export async function dispatchM4({ checkQueue, collect, runFull, runComposed, capture, signal }) {
  const collectOrFallback = stage => {
    try {
      return collect(stage);
    } catch {
      // Receipt failure may fall back only while the exact queued scope is still eligible.
      checkQueue(stage);
      return null;
    }
  };
  signal.throwIfAborted();
  checkQueue('dispatch');
  const expected = collectOrFallback('dispatch');
  if (!expected) return runFull();
  const { grant, outcome } = await runComposed(expected);
  const { exit, stampRefusals } = outcome;
  signal.throwIfAborted();
  checkQueue('accept');
  const latest = collectOrFallback('accept');
  // A genuine lane failure keeps its status even if the receipt expired during the run.
  if ((exit === 0 || stampRefusals === 1) && !same(latest, expected)) return runFull();
  if (exit === 0) capture(grant, outcome);
  return exit;
}
