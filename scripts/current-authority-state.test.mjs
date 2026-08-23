import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
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
import { resolveCurrentAuthority } from './current-authority-state.mjs';

const cli = new URL('./current-authority-state.mjs', import.meta.url).pathname;
const PROGRAM = 'IDA-WF01-ONE-APPROVAL-DELIVERY';
const B = '0'.repeat(40);
const S3 = ['docs/plans/current-authority-v1.json', 'scripts/current-authority-state.mjs'];
const S4A = ['.github/workflows/pr-delivery-gate.yml', 'scripts/ci/pr-delivery-gate.mjs'];

const envelope = () => ({
  approvalEnvelope: {
    children: [
      { order: 0, childId: 'S3-exact-authority', controlPlane: 'repository PR', writerPaths: S3 },
      {
        order: 1,
        childId: 'S4A-terminal-delivery',
        controlPlane: 'repository PR; protection remains unchanged',
        writerPaths: S4A,
      },
    ],
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
  return {
    ...state,
    operationSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
  };
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
  return [...history, merged, record(5, 'active', 'S4A-terminal-delivery', merged)];
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
    artifactHashes: {
      envelopeSha256: canonicalJsonDigest(envelope()),
      approvalReceiptSha256: canonicalJsonDigest(receipt()),
    },
    history,
    durable,
    live: live(durable, paths, liveOverrides),
  };
}

test('derives the exact current S3 repair writer map from the envelope and full history', () => {
  const source = input();
  const context = deriveAuthorityContext(source);
  assert.equal(context.childId, 'S3-exact-authority');
  assert.deepEqual(context.writerPaths, S3);
  assert.equal(context.base, B);
  assert.equal(resolveCurrentAuthority(source).runtimeAuthorized, true);
});

test('accepts only the sequential S4A child with its own writer map', () => {
  const source = input(s4aHistory());
  const result = resolveCurrentAuthority(source);
  assert.equal(result.activeSlice, 'S4A-terminal-delivery');
  assert.deepEqual(result.writerPaths, S4A);
});

test('missing, broken, skipped, or unlisted history fails closed', () => {
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
});

test('a repository child with a local boundary fails closed', () => {
  const history = s3History();
  history[2] = record(3, 'active', 'S3-exact-authority', history[1], {
    kind: 'local',
    postimageSha256: '7'.repeat(64),
  });
  assert.equal(resolveCurrentAuthority(input(history)).runtimeAuthorized, false);
});

test('base, writer, origin, worktree, and MCP drift fail closed', () => {
  const drifts = [
    { base: '9'.repeat(40) },
    { writerMapSha256: '9'.repeat(64) },
    { origin: 'https://github.com/foreign/interdomestik' },
    { worktree: { ...input().live.worktree, head: '9'.repeat(40) } },
    { mcp: { ...input().live.mcp, repoRoot: '/private/tmp/foreign' } },
  ];
  for (const drift of drifts)
    assert.equal(resolveCurrentAuthority(input(s3History(), drift)).runtimeAuthorized, false);
});

test('merge and terminal failure consume live authority immediately', () => {
  assert.equal(
    resolveCurrentAuthority(input(s3History(), { pullRequestState: 'MERGED' })).reason,
    'authority_consumed_by_merge'
  );
  const failed = resolveCurrentAuthority(input(s3History(), { terminalFailure: true }));
  assert.equal(failed.reason, 'terminal_failure');
  assert.equal(failed.successorsBlocked, true);
});

test('the stable anchor rejects legacy static lease fields', () => {
  assert.throws(() => validateProjection(projection({ projectedRevision: 20 })), /keys/i);
});

test('program and tracker carry one identical external-authority marker', () => {
  const marker =
    'The next active governed implementation goal is resolved only by the external authority chain for program: `IDA-WF01-ONE-APPROVAL-DELIVERY` (Tier 3; `runtime_authorized:external`).';
  assert.equal(validateProjectionDocuments(projection(), marker, marker), true);
  assert.throws(
    () => validateProjectionDocuments(projection(), marker, marker.replace('external', 'true')),
    /marker/i
  );
});

test('CLI requires the complete history and resolves the exact active lease', () => {
  const root = mkdtempSync(join(tmpdir(), 'current-authority-state-'));
  const source = input();
  const args = [];
  const cliInputs = {
    projection: source.projection,
    envelope: source.envelope,
    receipt: source.approvalReceipt,
    durable: source.durable,
    history: source.history,
    live: source.live,
  };
  for (const [name, value] of Object.entries(cliInputs)) {
    const path = join(root, `${name}.json`);
    const artifact = ['envelope', 'receipt'].includes(name);
    writeFileSync(path, artifact ? `${JSON.stringify(value, null, 2)}\n` : JSON.stringify(value));
    args.push(`--${name}=${path}`);
  }
  const active = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  assert.equal(active.status, 0, active.stderr);
  assert.equal(JSON.parse(active.stdout).activeSlice, 'S3-exact-authority');
  const noHistory = spawnSync(
    process.execPath,
    [cli, ...args.filter(arg => !arg.startsWith('--history='))],
    { encoding: 'utf8' }
  );
  assert.equal(noHistory.status, 1);
  assert.match(noHistory.stderr, /missing --history/i);
});
