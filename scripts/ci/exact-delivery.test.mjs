import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  canonicalJsonDigest,
  deriveAuthorityContext,
  writerMapDigest,
} from '../current-authority-state-lib.mjs';
import { authorityConsumption, verifyExactDelivery } from './exact-delivery-lib.mjs';
import { collectAuthority } from './exact-delivery.mjs';

const cli = new URL('./exact-delivery.mjs', import.meta.url).pathname;
const B = '0'.repeat(40);
const H = '1'.repeat(40);
const T = '2'.repeat(40);
const M = '3'.repeat(40);
const HEAD_TREE = '4'.repeat(40);
const TESTED_TREE = '5'.repeat(40);
const writers = ['docs/plans/current-authority-v1.json', 'scripts/ci/exact-delivery.mjs'];
const envelope = () => ({
  approvalEnvelope: {
    children: [
      {
        order: 0,
        childId: 'S3-exact-authority',
        controlPlane: 'repository PR',
        writerPaths: writers,
      },
    ],
  },
});
const receipt = () => ({ approvalId: 'fixture' });
const projection = () => ({
  schemaVersion: 1,
  programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY',
  envelopePath: 'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-envelope-v1.json',
  envelopeSha256: canonicalJsonDigest(envelope()),
  approvalReceiptPath:
    'docs/plans/2026-08-21-ida-wf01-one-approval-delivery-approval-receipt-r1.json',
  approvalReceiptSha256: canonicalJsonDigest(receipt()),
  liveDispositionRequired: 'open',
  repositoryConsumptionRule: 'merged_closed_or_terminal_failure',
});
function record(base = B) {
  const state = {
    schemaVersion: 1,
    programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY',
    revision: 1,
    status: 'active',
    childId: 'S3-exact-authority',
    runtimeAuthorized: true,
    successorsBlocked: false,
    envelopeSha256: projection().envelopeSha256,
    approvalReceiptSha256: projection().approvalReceiptSha256,
    boundary: { kind: 'git', B: '6'.repeat(40), H: '7'.repeat(40), T: '8'.repeat(40), M: base },
    evidenceRef: `evidence/S3-exact-authority-${'9'.repeat(64)}.json`,
    previousOperationSha256: null,
  };
  return {
    ...state,
    operationSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
  };
}
function authorityState(base = B) {
  const durable = record(base);
  return {
    projection: projection(),
    envelope: envelope(),
    approvalReceipt: receipt(),
    artifactHashes: {
      envelopeSha256: canonicalJsonDigest(envelope()),
      approvalReceiptSha256: canonicalJsonDigest(receipt()),
    },
    durable,
    history: [durable],
  };
}
function facts(overrides = {}) {
  return {
    schemaVersion: 1,
    repository: 'interdomestik/interdomestik',
    origin: 'https://github.com/interdomestik/interdomestik',
    mergeMethod: 'SQUASH',
    base: B,
    head: H,
    testedMerge: T,
    returnedMain: M,
    protectedMain: M,
    pullRequest: {
      number: 1619,
      state: 'MERGED',
      baseRef: 'main',
      headRef: 'codex/s3-exact-authority',
      baseSha: B,
      headSha: H,
      mergeCommitSha: M,
    },
    worktree: {
      root: '/private/tmp/s3',
      commonDir: '/repo/.git',
      head: H,
      branch: 'codex/s3-exact-authority',
    },
    mcp: {
      sourceRoot: '/runtime/interdomestik-qa',
      sourceHead: 'a'.repeat(40),
      sourceCommonDir: '/repo/.git',
      targetRoot: '/private/tmp/s3',
      targetHead: H,
      targetCommonDir: '/repo/.git',
      repoRoot: '/private/tmp/s3',
    },
    commits: {
      [B]: { parents: [], tree: 'b'.repeat(40) },
      [H]: { parents: [B], tree: HEAD_TREE },
      [T]: { parents: [B, H], tree: TESTED_TREE },
      [M]: { parents: [B], tree: TESTED_TREE },
    },
    writerPaths: writers,
    writerMapSha256: writerMapDigest(writers),
    requiredContexts: ['audit'],
    terminalDelivery: true,
    finalIntake: 'clean',
    lanes: [
      {
        name: 'audit',
        checkedSha: T,
        checkedTree: TESTED_TREE,
        runId: 123,
        runAttempt: 1,
        appId: 15368,
        conclusion: 'success',
      },
    ],
    ...overrides,
  };
}
function authority(overrides = {}, input = facts()) {
  return {
    context: deriveAuthorityContext(authorityState()),
    origin: input.origin,
    pullRequest: input.pullRequest,
    worktree: input.worktree,
    commits: input.commits,
    protectedMain: input.protectedMain,
    changedPaths: writers,
    requiredChecks: [{ context: 'audit', appId: 15368 }],
    ...overrides,
  };
}
const verify = (input, trusted = authority({}, input)) => verifyExactDelivery(input, trusted);
test('accepts exact B/H/T/M with the envelope-derived writer context', () => {
  const result = verify(facts());
  assert.equal(result.ok, true);
  assert.equal(result.testedTree, TESTED_TREE);
  assert.notEqual(HEAD_TREE, TESTED_TREE);
});
test('rejects the wrong tested parents or returned-main parent/tree', () => {
  const wrongOrder = facts();
  wrongOrder.commits[T].parents = [H, B];
  assert.throws(() => verify(wrongOrder), /tested merge parents/i);
  const wrongParent = facts();
  wrongParent.commits[M].parents = [H];
  assert.throws(() => verify(wrongParent), /returned main parent/i);
  const wrongTree = facts();
  wrongTree.commits[M].tree = HEAD_TREE;
  assert.throws(() => verify(wrongTree), /returned main tree/i);
});
test('head-only lanes require head and tested tree equality', () => {
  const invalid = facts();
  invalid.lanes[0] = { ...invalid.lanes[0], checkedSha: H, checkedTree: HEAD_TREE };
  assert.throws(() => verify(invalid), /head-only lane/i);
  const valid = facts();
  valid.commits[H].tree = TESTED_TREE;
  valid.lanes[0] = { ...valid.lanes[0], checkedSha: H, checkedTree: TESTED_TREE };
  assert.equal(verify(valid).ok, true);
});

test('terminal delivery, clean intake, exact main, and lane app identity are required', () => {
  assert.throws(() => verify(facts({ terminalDelivery: false })), /terminal delivery/i);
  assert.throws(() => verify(facts({ finalIntake: 'pending' })), /final intake/i);
  assert.throws(() => verify(facts({ protectedMain: B })), /protected main/i);
  const wrongApp = facts();
  wrongApp.lanes[0].appId = null;
  assert.throws(() => verify(wrongApp), /lane identity/i);
});

test('derived child, base, writer map, and changed paths are exact', () => {
  assert.throws(() => verify(facts({ writerMapSha256: 'f'.repeat(64) })), /writer map/i);
  assert.throws(
    () => verify(facts(), authority({ context: { ...authority().context, base: H } })),
    /context base/i
  );
  assert.throws(
    () => verify(facts(), authority({ changedPaths: [...writers, 'foreign.mjs'] })),
    /changed paths/i
  );
});

test('PR, worktree, common-dir, and MCP identities remain exact', () => {
  const candidates = [facts(), facts(), facts()];
  candidates[0].pullRequest.headSha = B;
  candidates[1].worktree.branch = 'foreign';
  candidates[2].mcp.repoRoot = '/private/tmp/foreign';
  assert.throws(() => verify(candidates[0]), /pull request commit/i);
  assert.throws(() => verify(candidates[1]), /worktree identity/i);
  assert.throws(() => verify(candidates[2]), /MCP target identity/i);
});

test('merge or terminal failure consumes semantic authority immediately', () => {
  assert.equal(
    authorityConsumption({ pullRequestState: 'MERGED', terminalFailure: false }).reason,
    'authority_consumed_by_merge'
  );
  const failure = authorityConsumption({ pullRequestState: 'OPEN', terminalFailure: true });
  assert.equal(failure.consumed, true);
  assert.equal(failure.successorsBlocked, true);
});

test('trusted collector uses the same derived authority context', () => {
  const root = mkdtempSync(join(tmpdir(), 'exact-delivery-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['config', 'user.email', 'fixture@example.invalid'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  spawnSync('git', ['remote', 'add', 'origin', 'git@github.com:interdomestik/interdomestik.git'], {
    cwd: root,
  });
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', '.'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'base'], { cwd: root });
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim();
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  mkdirSync(join(root, 'scripts/ci'), { recursive: true });
  writeFileSync(join(root, writers[0]), `${JSON.stringify(projection(), null, 2)}\n`);
  writeFileSync(join(root, writers[1]), 'fixture\n');
  spawnSync('git', ['add', ...writers], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'head'], { cwd: root });
  const head = git('rev-parse', 'HEAD');
  const tree = git('show', '-s', '--format=%T', head);
  const tested = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'tested');
  const main = git('commit-tree', tree, '-p', base, '-m', 'main');
  const repoRoot = git('rev-parse', '--show-toplevel');
  const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const branch = git('branch', '--show-current');
  const input = facts({
    base,
    head,
    testedMerge: tested,
    returnedMain: main,
    protectedMain: main,
    pullRequest: {
      ...facts().pullRequest,
      headRef: branch,
      baseSha: base,
      headSha: head,
      mergeCommitSha: main,
    },
    worktree: { root: repoRoot, commonDir, head, branch },
    mcp: {
      ...facts().mcp,
      targetRoot: repoRoot,
      targetHead: head,
      targetCommonDir: commonDir,
      repoRoot,
      sourceCommonDir: commonDir,
    },
    commits: {
      [base]: { parents: [], tree: git('show', '-s', '--format=%T', base) },
      [head]: { parents: [base], tree },
      [tested]: { parents: [base, head], tree },
      [main]: { parents: [base], tree },
    },
    lanes: [{ ...facts().lanes[0], checkedSha: tested, checkedTree: tree }],
  });
  const github = endpoint =>
    endpoint.endsWith('required_status_checks')
      ? { checks: [{ context: 'audit', app_id: 15368 }] }
      : endpoint.includes('/pulls/')
        ? {
            number: 1619,
            merged: true,
            state: 'closed',
            base: { ref: 'main', sha: base },
            head: { ref: branch, sha: head },
            merge_commit_sha: main,
          }
        : { object: { sha: main } };
  const trusted = collectAuthority(root, input, authorityState(base), github);
  assert.equal(verifyExactDelivery(input, trusted).ok, true);
  const path = join(root, 'facts.json');
  writeFileSync(path, JSON.stringify(input));
  const rejected = spawnSync(process.execPath, [cli, `--input=${path}`], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /missing --repo/i);
});
