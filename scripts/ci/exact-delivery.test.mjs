import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { authorityConsumption, verifyExactDelivery, writerDigest } from './exact-delivery-lib.mjs';
import { collectAuthority } from './exact-delivery.mjs';

const cli = new URL('./exact-delivery.mjs', import.meta.url).pathname;

const B = '0'.repeat(40);
const H = '1'.repeat(40);
const T = '2'.repeat(40);
const M = '3'.repeat(40);
const HEAD_TREE = '4'.repeat(40);
const TESTED_TREE = '5'.repeat(40);
const writers = ['docs/plans/current-authority-v1.json', 'scripts/ci/exact-delivery.mjs'];

function git(root, args) {
  const result = spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
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
      sourceHead: '7'.repeat(40),
      sourceCommonDir: '/repo/.git',
      targetRoot: '/private/tmp/s3',
      targetHead: H,
      targetCommonDir: '/repo/.git',
      repoRoot: '/private/tmp/s3',
    },
    commits: {
      [B]: { parents: [], tree: '6'.repeat(40) },
      [H]: { parents: [B], tree: HEAD_TREE },
      [T]: { parents: [B, H], tree: TESTED_TREE },
      [M]: { parents: [B], tree: TESTED_TREE },
    },
    writerPaths: writers,
    writerMapSha256: writerDigest(writers),
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
    projection: {
      schemaVersion: 1,
      programId: 'IDA-WF01-ONE-APPROVAL-DELIVERY',
      sourceMain: B,
      projectedRevision: 20,
      projectedChild: 'S3-exact-authority',
      projectedOperationSha256: '6'.repeat(64),
      envelopeSha256: '7'.repeat(64),
      approvalReceiptSha256: '8'.repeat(64),
      writerPaths: writers,
      writerMapSha256: writerDigest(writers),
      liveDispositionRequired: 'open',
      repositoryConsumptionRule: 'merged_closed_or_terminal_failure',
      successorAfterHealthCleanup: 'S4A-terminal-delivery',
    },
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

test('accepts exact B/H/T/M without requiring tree(M)=tree(H)', () => {
  const result = verify(facts());
  assert.equal(result.ok, true);
  assert.equal(result.testedTree, TESTED_TREE);
  assert.notEqual(HEAD_TREE, TESTED_TREE);
});
test('accepts semantically identical authority objects with reordered keys', () => {
  const input = facts();
  const trusted = authority({}, input);
  trusted.pullRequest = Object.fromEntries(Object.entries(trusted.pullRequest).reverse());
  trusted.commits = Object.fromEntries(Object.entries(trusted.commits).reverse());
  assert.equal(verify(input, trusted).ok, true);
});
test('rejects an invalid tested merge parent order', () => {
  const input = facts();
  input.commits[T].parents = [H, B];
  assert.throws(() => verify(input), /tested merge parents/i);
});

test('rejects returned main with the wrong parent or tree', () => {
  const wrongParent = facts();
  wrongParent.commits[M].parents = [H];
  assert.throws(() => verify(wrongParent), /returned main parent/i);
  const wrongTree = facts();
  wrongTree.commits[M].tree = HEAD_TREE;
  assert.throws(() => verify(wrongTree), /returned main tree/i);
});

test('head-only lane is valid only when head and tested trees match', () => {
  const invalid = facts();
  invalid.lanes[0] = { ...invalid.lanes[0], checkedSha: H, checkedTree: HEAD_TREE };
  assert.throws(() => verify(invalid), /head-only lane/i);
  const valid = facts();
  valid.commits[H].tree = TESTED_TREE;
  valid.lanes[0] = { ...valid.lanes[0], checkedSha: H, checkedTree: TESTED_TREE };
  assert.equal(verify(valid).ok, true);
});

test('missing terminal delivery, clean intake, or exact main fails', () => {
  assert.throws(() => verify(facts({ terminalDelivery: false })), /terminal delivery/i);
  assert.throws(() => verify(facts({ finalIntake: 'pending' })), /final intake/i);
  assert.throws(() => verify(facts({ protectedMain: B })), /protected main/i);
});

test('lane identity and writer map are closed contracts', () => {
  const wrongApp = facts();
  wrongApp.lanes[0].appId = null;
  assert.throws(() => verify(wrongApp), /lane identity/i);
  const wrongWriters = facts({ writerMapSha256: 'f'.repeat(64) });
  assert.throws(() => verify(wrongWriters), /writer map/i);
  const omittedContext = authority({
    requiredChecks: [
      { context: 'audit', appId: 15368 },
      { context: 'security', appId: 15368 },
    ],
  });
  assert.throws(() => verify(facts(), omittedContext), /authoritative required context/i);
  assert.throws(
    () => verify(facts(), authority({ changedPaths: [...writers, 'scripts/foreign.mjs'] })),
    /actual changed paths/i
  );
});

test('PR, worktree, common-dir, and MCP identities are exact', () => {
  const wrongPr = facts();
  wrongPr.pullRequest.headSha = B;
  assert.throws(() => verify(wrongPr), /pull request commit/i);
  const wrongWorktree = facts();
  wrongWorktree.worktree.branch = 'foreign';
  assert.throws(() => verify(wrongWorktree), /worktree identity/i);
  const wrongMcp = facts();
  wrongMcp.mcp.repoRoot = '/private/tmp/foreign';
  assert.throws(() => verify(wrongMcp), /MCP target identity/i);
  const wrongSource = facts();
  wrongSource.mcp.sourceHead = 'invalid';
  assert.throws(() => verify(wrongSource), /MCP source head/i);
  const wrongCommonDir = facts();
  wrongCommonDir.mcp.targetCommonDir = '/foreign/.git';
  assert.throws(() => verify(wrongCommonDir), /common directory/i);
});

test('merge or terminal failure consumes semantic authority immediately', () => {
  assert.deepEqual(authorityConsumption({ pullRequestState: 'MERGED', terminalFailure: false }), {
    consumed: true,
    successorsBlocked: false,
    reason: 'authority_consumed_by_merge',
  });
  assert.deepEqual(authorityConsumption({ pullRequestState: 'OPEN', terminalFailure: true }), {
    consumed: true,
    successorsBlocked: true,
    reason: 'terminal_failure',
  });
  assert.deepEqual(authorityConsumption({ pullRequestState: 'OPEN', terminalFailure: false }), {
    consumed: false,
    successorsBlocked: false,
    reason: 'active',
  });
});

test('trusted collector returns a machine-readable exact-delivery verdict', () => {
  const root = mkdtempSync(join(tmpdir(), 'exact-delivery-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'user.name', 'Fixture']);
  git(root, ['remote', 'add', 'origin', 'git@github.com:interdomestik/interdomestik.git']);
  const repoRoot = git(root, ['rev-parse', '--show-toplevel']);
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-qm', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']);
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  mkdirSync(join(root, 'scripts/ci'), { recursive: true });
  const projected = authority().projection;
  projected.sourceMain = base;
  writeFileSync(join(root, writers[0]), `${JSON.stringify(projected, null, 2)}\n`);
  writeFileSync(join(root, writers[1]), 'fixture\n');
  git(root, ['add', ...writers]);
  git(root, ['commit', '-qm', 'head']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['show', '-s', '--format=%T', head]);
  const tested = git(root, ['commit-tree', tree, '-p', base, '-p', head, '-m', 'tested']);
  const main = git(root, ['commit-tree', tree, '-p', base, '-m', 'main']);
  const commonDir = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  const branch = git(root, ['branch', '--show-current']);
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
      [base]: { parents: [], tree: git(root, ['show', '-s', '--format=%T', base]) },
      [head]: { parents: [base], tree },
      [tested]: { parents: [base, head], tree },
      [main]: { parents: [base], tree },
    },
    lanes: [{ ...facts().lanes[0], checkedSha: tested, checkedTree: tree }],
  });
  const path = join(root, 'facts.json');
  writeFileSync(path, JSON.stringify(input));
  const github = endpoint => {
    if (endpoint.endsWith('required_status_checks')) {
      return { checks: [{ context: 'audit', app_id: 15368 }] };
    }
    if (endpoint.includes('/pulls/')) {
      return {
        number: 1619,
        merged: true,
        state: 'closed',
        base: { ref: 'main', sha: base },
        head: { ref: branch, sha: head },
        merge_commit_sha: main,
      };
    }
    return { object: { sha: main } };
  };
  const trusted = collectAuthority(root, input, github);
  assert.deepEqual(verifyExactDelivery(input, trusted), {
    ok: true,
    testedTree: tree,
    returnedMain: main,
  });
  const invalid = { ...input, protectedMain: base };
  assert.throws(() => verifyExactDelivery(invalid, trusted), /protected main/i);
  const rejected = spawnSync(process.execPath, [cli, `--input=${path}`], { encoding: 'utf8' });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /missing --repo/i);
});
