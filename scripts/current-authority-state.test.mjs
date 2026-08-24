import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  canonicalJsonDigest,
  deriveAuthorityContext,
  validateProjection,
  validateProjectionDocuments,
  writerMapDigest,
} from './current-authority-state-lib.mjs';
import { readDurableAuthority, resolveCurrentAuthority } from './current-authority-state.mjs';
const cli = new URL('./current-authority-state.mjs', import.meta.url).pathname;
const PROGRAM = 'IDA-WF01-ONE-APPROVAL-DELIVERY';
const B = '0'.repeat(40);
const S3 = ['docs/plans/current-authority-v1.json', 'scripts/current-authority-state.mjs'];
const S4A = ['.github/workflows/pr-delivery-gate.yml', 'scripts/ci/pr-delivery-gate.mjs'];
const S4B = ['.github/reviewer-routing.json', 'scripts/github-request-pr-reviewers.mjs'];
const CLOSEOUT_STATES = 'merged_consumed active merged_consumed closeout_required closed'.split(
  ' '
);
const digest = value => createHash('sha256').update(value).digest('hex');
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
const envelope = () => ({
  approvalEnvelope: {
    children: [
      ['S3-exact-authority', 'repository PR', S3],
      ['S4A-terminal-delivery', 'repository PR; protection remains unchanged', S4A],
      ['S4B-reviewer-policy', 'repository PR', S4B],
    ].map(([childId, controlPlane, writerPaths], order) => ({
      order,
      childId,
      controlPlane,
      writerPaths,
    })),
  },
});
const receipt = () => ({ approvalId: 'fixture' });
function projection(overrides = {}) {
  return {
    schemaVersion: 1,
    programId: PROGRAM,
    envelopePath: 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json',
    envelopeSha256: canonicalJsonDigest(envelope()),
    approvalReceiptPath:
      'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json',
    approvalReceiptSha256: canonicalJsonDigest(receipt()),
    liveDispositionRequired: 'open',
    repositoryConsumptionRule: 'merged_closed_or_terminal_failure',
    ...overrides,
  };
}
const artifactHashes = (projected = projection()) => ({
  envelopeSha256: projected.envelopeSha256,
  approvalReceiptSha256: projected.approvalReceiptSha256,
});
function record(revision, status, childId, previous, boundary = gitBoundary()) {
  const state = {
    schemaVersion: 1,
    programId: PROGRAM,
    revision,
    status,
    childId,
    runtimeAuthorized: /^(active|prepared|installing)$/u.test(status),
    successorsBlocked: /^(failed_consumed|rolled_back_consumed|incident|failed)$/u.test(status),
    envelopeSha256: projection().envelopeSha256,
    approvalReceiptSha256: projection().approvalReceiptSha256,
    boundary,
    evidenceRef: `evidence/${childId}-${String(revision).padStart(64, '0')}.json`,
    previousOperationSha256: previous?.operationSha256 ?? null,
  };
  state.operationSha256 = digest(JSON.stringify(state));
  return state;
}
function gitBoundary() {
  return { kind: 'git', B: '1'.repeat(40), H: '2'.repeat(40), T: '3'.repeat(40), M: B };
}
function s3History() {
  const active = record(1, 'active', 'S3-exact-authority');
  const consumed = record(2, 'merged_consumed', 'S3-exact-authority', active);
  return [active, consumed, record(3, 'active', 'S3-exact-authority', consumed)];
}
function s4aHistory() {
  const history = s3History();
  const merged = record(4, 'merged_consumed', 'S3-exact-authority', history.at(-1));
  const boundary = Object.fromEntries(Object.entries(gitBoundary()).reverse());
  return [...history, merged, record(5, 'active', 'S4A-terminal-delivery', merged, boundary)];
}
function s4bCloseoutHistory() {
  const history = s4aHistory();
  for (const status of CLOSEOUT_STATES) {
    const childId = history.length === 5 ? 'S4A-terminal-delivery' : 'S4B-reviewer-policy';
    history.push(record(history.length + 1, status, childId, history.at(-1)));
  }
  return history;
}
function evidence(history) {
  return history.map((current, index) => {
    const previous = history[index - 1];
    const movement = previous && previous.childId !== current.childId;
    const key = `${previous?.status ?? 'start'}:${current.status}:${Number(Boolean(movement))}`;
    const event =
      {
        'start:active:0': 'health_cleanup_pass',
        'active:merged_consumed:0': 'merge_consumed',
        'merged_consumed:active:0': 'successor_projection_recovered',
        'merged_consumed:active:1': 'health_cleanup_pass',
        'merged_consumed:closeout_required:0': 'health_cleanup_pass',
        'closeout_required:closed:0': 'success_closeout',
        'active:failed_consumed:0': 'failure_consumed',
      }[key] ?? null;
    return {
      schemaVersion: 1,
      programId: PROGRAM,
      revision: current.revision,
      event,
      fromChild: previous?.childId ?? 'B0-authority-bootstrap',
      toChild: current.childId,
      boundary: Object.fromEntries(Object.entries(current.boundary).reverse()),
      previousOperationSha256: current.previousOperationSha256,
      proofSha256: 'f'.repeat(64),
    };
  });
}
function live(durable, paths, overrides = {}) {
  return {
    operationSha256: durable.operationSha256,
    childId: durable.childId,
    disposition: 'open',
    pullRequestNumber: 1620,
    pullRequestState: 'OPEN',
    terminalFailure: false,
    origin: 'https://github.com/interdomestik/interdomestik',
    base: B,
    head: '4'.repeat(40),
    testedMerge: '5'.repeat(40),
    protectedMain: B,
    writerMapSha256: writerMapDigest(paths),
    worktree: { root: '/private/tmp/writer', commonDir: '/repo/.git', head: '4'.repeat(40) },
    mcp: {
      sourceRoot: '/runtime/interdomestik-qa',
      sourceHead: '6'.repeat(40),
      sourceCommonDir: '/repo/.git',
      targetRoot: '/private/tmp/writer',
      targetHead: '4'.repeat(40),
      targetCommonDir: '/repo/.git',
      repoRoot: '/private/tmp/writer',
    },
    ...overrides,
  };
}
function input(history = s3History(), liveOverrides = {}) {
  const durable = history.at(-1);
  const paths = durable.childId === 'S3-exact-authority' ? S3 : S4A;
  return {
    projection: projection(),
    envelope: envelope(),
    approvalReceipt: receipt(),
    artifactHashes: artifactHashes(),
    history,
    durable,
    evidence: evidence(history),
    live: live(durable, paths, liveOverrides),
  };
}
function durableFixture() {
  const root = mkdtempSync(join(tmpdir(), 'authority-root-'));
  mkdirSync(join(root, 'receipts'));
  mkdirSync(join(root, 'evidence'));
  const approved = envelope();
  approved.approvalEnvelope.durableAuthority = {
    root,
    state: 'authority-v1.json',
    receiptClass: 'receipts/<operation-sha256>.json',
    evidenceClass: 'evidence/<child-id>-<evidence-sha256>.json',
  };
  const projected = projection({ envelopeSha256: canonicalJsonDigest(approved) });
  const initial = record(1, 'active', 'S3-exact-authority');
  const proof = evidence([initial])[0];
  const evidenceRef = `evidence/${initial.childId}-${canonicalJsonDigest(proof)}.json`;
  const { operationSha256: _operation, ...state } = {
    ...initial,
    envelopeSha256: projected.envelopeSha256,
    evidenceRef,
  };
  const durable = { ...state, operationSha256: digest(JSON.stringify(state)) };
  const source = input([durable]);
  source.projection = projected;
  source.envelope = approved;
  source.artifactHashes = artifactHashes(projected);
  writeJson(join(root, 'authority-v1.json'), durable);
  writeJson(join(root, 'receipts', `${durable.operationSha256}.json`), durable);
  writeJson(join(root, evidenceRef), proof);
  return {
    root,
    source,
    paths: { durablePath: join(root, 'authority-v1.json'), historyPath: join(root, 'receipts') },
  };
}
test('resolves sequential authority states and fail-closes drift', () => {
  const context = deriveAuthorityContext(input());
  assert.deepEqual([context.childId, context.base], ['S3-exact-authority', B]);
  assert.deepEqual(context.writerPaths, S3);
  assert.equal(resolveCurrentAuthority(input()).runtimeAuthorized, true);
  const result = resolveCurrentAuthority(input(s4bCloseoutHistory()));
  assert.equal(result.reason, 'authority_not_active');
  assert.deepEqual(
    [result.runtimeAuthorized, result.activeSlice, result.successorsBlocked],
    [false, null, false]
  );
  for (const event of ['closeout', 'unknown_closeout']) {
    const source = input(s4bCloseoutHistory());
    source.evidence.at(-1).event = event;
    assert.equal(resolveCurrentAuthority(source).reason, 'invalid_authority_projection');
  }
  const missing = input(s3History().slice(1));
  const brokenHistory = s3History();
  brokenHistory[2] = record(3, 'active', 'S3-exact-authority', brokenHistory[0]);
  const skipped = s3History();
  skipped.push(record(4, 'active', 'S4B-reviewer-policy', skipped.at(-1)));
  const prematureCloseout = s4aHistory();
  prematureCloseout.push(
    record(6, 'closeout_required', 'S4A-terminal-delivery', prematureCloseout.at(-1))
  );
  for (const source of [missing, input(brokenHistory), input(skipped), input(prematureCloseout)]) {
    assert.equal(resolveCurrentAuthority(source).reason, 'invalid_authority_projection');
  }
  const active = record(1, 'active', 'S3-exact-authority');
  const failed = record(2, 'failed_consumed', 'S3-exact-authority', active);
  const reopened = record(3, 'active', 'S3-exact-authority', failed);
  assert.doesNotThrow(() => deriveAuthorityContext(input([active, failed])));
  assert.equal(resolveCurrentAuthority(input([active, failed, reopened])).runtimeAuthorized, false);
  const { root: fixtureRoot, source: fixtureSource, paths: fixturePaths } = durableFixture();
  assert.equal(readDurableAuthority(fixtureSource.envelope, fixturePaths).history.length, 1);
  assert.throws(
    () =>
      readDurableAuthority(fixtureSource.envelope, {
        ...fixturePaths,
        durablePath: join(fixtureRoot, 'receipts', `${fixtureSource.durable.operationSha256}.json`),
      }),
    /state path/i
  );
  const proofPath = join(fixtureRoot, fixtureSource.durable.evidenceRef);
  unlinkSync(proofPath);
  symlinkSync('/etc/hosts', proofPath);
  assert.throws(() => readDurableAuthority(fixtureSource.envelope, fixturePaths), /evidence path/i);
  const drifts = [
    { base: '9'.repeat(40) },
    { writerMapSha256: '9'.repeat(64) },
    { origin: 'https://github.com/foreign/interdomestik' },
    { worktree: { ...input().live.worktree, head: '9'.repeat(40) } },
    { mcp: { ...input().live.mcp, repoRoot: '/private/tmp/foreign' } },
  ];
  for (const drift of drifts)
    assert.equal(resolveCurrentAuthority(input(s3History(), drift)).runtimeAuthorized, false);
  const history = s3History();
  history[2] = record(3, 'active', 'S3-exact-authority', history[1], {
    kind: 'local',
    postimageSha256: '7'.repeat(64),
  });
  assert.equal(resolveCurrentAuthority(input(history)).runtimeAuthorized, false);
  const merge = resolveCurrentAuthority(input(s3History(), { pullRequestState: 'MERGED' }));
  assert.equal(merge.reason, 'authority_consumed_by_merge');
  const terminalFailure = resolveCurrentAuthority(input(s3History(), { terminalFailure: true }));
  assert.equal(terminalFailure.reason, 'terminal_failure');
  assert.equal(terminalFailure.successorsBlocked, true);
  assert.throws(() => validateProjection(projection({ projectedRevision: 20 })), /keys/i);
  assert.throws(() => writerMapDigest(['scripts/../outside.mjs']), /unsafe writer path/i);
  const marker =
    'The next active governed implementation goal is resolved only by the external authority chain for program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:external`).';
  assert.equal(validateProjectionDocuments(projection(), marker, marker), true);
  assert.throws(
    () => validateProjectionDocuments(projection(), marker, marker.replace('external', 'true')),
    /marker/i
  );
  const { root: cliRoot, source: cliSource, paths: cliPaths } = durableFixture();
  const args = [`--durable=${cliPaths.durablePath}`, `--history=${cliPaths.historyPath}`];
  const cliInputs = {
    projection: cliSource.projection,
    envelope: cliSource.envelope,
    receipt: cliSource.approvalReceipt,
    live: cliSource.live,
  };
  for (const [name, value] of Object.entries(cliInputs)) {
    const path = join(cliRoot, `${name}.json`);
    writeJson(path, value);
    args.push(`--${name}=${path}`);
  }
  const cliResult = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).activeSlice, 'S3-exact-authority');
  const incomplete = args.filter(arg => !arg.startsWith('--history='));
  const noHistory = spawnSync(process.execPath, [cli, ...incomplete], { encoding: 'utf8' });
  assert.equal(noHistory.status, 1);
  assert.match(noHistory.stderr, /missing --history/i);
});
