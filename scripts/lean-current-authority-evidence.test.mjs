import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveRepositoryAuthority, selectFullProductPull } from './lean-current-authority.mjs';
import { assertCanonicalWriterWorktree } from './lean-current-authority-evidence.mjs';
import {
  changedPathsBetween,
  collectPromotionFacts,
  git,
  isAncestor,
  pullFacts,
} from './lean-current-authority-git.mjs';
import {
  authorityPathsTouched,
  locateAuthorityTransition,
} from './lean-current-authority-history.mjs';

const authorityBlock = value =>
  `## Lean Authority\n\n\`\`\`json lean-authority\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
const gitBlobSha = bytes =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
const inactiveProjection = {
  schemaVersion: 1,
  authority: 'lean-tier12-v1',
  lifecycle: 'inactive',
  owner: { login: 'arbenl', id: 62884977 },
  activeSlice: null,
};
const activeProjection = {
  ...inactiveProjection,
  lifecycle: 'promotion_pending',
  activeSlice: {
    sliceId: 'IDA-UI-HISTORY',
    tier: 2,
    promotionPrNumber: 1700,
    promotionBaseSha: '0'.repeat(40),
    expectedProductBranch: 'codex/ida-ui-history',
    gateSha256: 'a'.repeat(64),
    admissionSha256: 'b'.repeat(64),
    productWriterPaths: ['apps/web/src/app/[locale]/page.tsx'],
    closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
  },
};

function commitProjection(root, projection, message) {
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  for (const name of ['current-program.md', 'current-tracker.md']) {
    writeFileSync(join(root, 'docs/plans', name), authorityBlock(projection));
  }
  git(root, 'add', 'docs/plans/current-program.md', 'docs/plans/current-tracker.md');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function gitFixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(root, 'init');
  git(root, 'config', 'user.email', 'fixture@interdomestik.test');
  git(root, 'config', 'user.name', 'Fixture');
  return root;
}

test('writer-bound authority rejects every tracked skip-worktree tag without blocking reads', () => {
  const root = gitFixture('lean-authority-writer-worktree-');
  writeFileSync(join(root, 'tracked.txt'), 'canonical\n');
  git(root, 'add', 'tracked.txt');
  git(root, 'commit', '-m', 'canonical');

  assert.doesNotThrow(() => assertCanonicalWriterWorktree(root));
  git(root, 'update-index', '--skip-worktree', 'tracked.txt');
  assert.throws(
    () => assertCanonicalWriterWorktree(root),
    /tracked skip-worktree state blocks Lean activation/u
  );
  assert.doesNotThrow(() => assertCanonicalWriterWorktree(root, false));

  git(root, 'update-index', '--assume-unchanged', 'tracked.txt');
  assert.match(git(root, 'ls-files', '-v', 'tracked.txt'), /^s /u);
  assert.throws(
    () => assertCanonicalWriterWorktree(root),
    /tracked skip-worktree state blocks Lean activation/u
  );
});

test('repository boundary returns stable blocked authority instead of throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'lean-authority-malformed-'));
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  for (const name of ['current-program.md', 'current-tracker.md']) {
    writeFileSync(
      join(root, 'docs/plans', name),
      '```json lean-authority\n{"not":"canonical"}\n```\n'
    );
  }
  assert.doesNotThrow(() => resolveRepositoryAuthority(root, true));
  assert.equal(resolveRepositoryAuthority(root, true).reason, 'authority_evidence_unavailable');
});

test('downstream list summary is expanded to one full pull response', () => {
  assert.throws(() => selectFullProductPull(null, () => ({})), /inventory/);
  for (const full of [
    { number: 7, state: 'open', merged: false, changed_files: 2 },
    { number: 8, state: 'closed', merged: false, changed_files: 2 },
    { number: 9, state: 'closed', merged: true, changed_files: 2 },
  ]) {
    assert.deepEqual(
      selectFullProductPull([{ number: full.number }], number => ({ ...full, number })),
      full
    );
  }
  assert.equal(
    selectFullProductPull([], () => assert.fail('unexpected read')),
    null
  );
  assert.throws(
    () => selectFullProductPull([{ number: 1 }, { number: 2 }], () => ({})),
    /multiple/
  );
});

test('GitHub pull fixtures are bound to real Git commit parent, tree, review and file facts', () => {
  const root = gitFixture('lean-authority-git-fixture-');
  writeFileSync(join(root, 'first.txt'), 'first\n');
  git(root, 'add', 'first.txt');
  git(root, 'commit', '-m', 'first');
  const base = git(root, 'rev-parse', 'HEAD');
  writeFileSync(join(root, 'second.txt'), 'second\n');
  git(root, 'add', 'second.txt');
  git(root, 'commit', '-m', 'second');
  const head = git(root, 'rev-parse', 'HEAD');
  const gatePath = 'docs/plans/2026-09-01-fixture-design.md';
  const admissionPath = 'docs/plans/2026-09-01-fixture-admission.json';
  const gateBytes = Buffer.from('fixture gate\n');
  const admissionBytes = Buffer.from('{"fixture":true}\n');
  const gateBlobSha = gitBlobSha(gateBytes);
  const admissionBlobSha = gitBlobSha(admissionBytes);
  const fixture = {
    number: 1700,
    state: 'closed',
    merged: true,
    base: { sha: base },
    head: { sha: head, ref: 'codex/fixture' },
    merge_commit_sha: head,
    changed_files: 4,
  };
  const readCommit = (_repo, sha) => ({
    parents: git(root, 'show', '-s', '--format=%P', sha).split(' ').filter(Boolean),
    tree: git(root, 'rev-parse', `${sha}^{tree}`),
  });
  const facts = pullFacts(root, fixture, [], readCommit);
  assert.deepEqual(facts.mergeParents, [base]);
  assert.equal(facts.headTree, git(root, 'rev-parse', `${head}^{tree}`));
  assert.equal(facts.mergeTree, facts.headTree);
  const treeEndpoint = `repos/interdomestik/interdomestik/git/trees/${facts.headTree}?recursive=1`;

  const responses = new Map([
    ['repos/interdomestik/interdomestik/pulls/1700', fixture],
    [
      'repos/interdomestik/interdomestik/pulls/1700/reviews?per_page=100',
      [
        {
          state: 'COMMENTED',
          body: 'fixture marker',
          commit_id: head,
          user: { login: 'arbenl', id: 62884977 },
        },
      ],
    ],
    [
      'repos/interdomestik/interdomestik/pulls/1700/files?per_page=100',
      [
        { filename: gatePath },
        { filename: admissionPath },
        { filename: 'docs/plans/current-program.md' },
        { filename: 'docs/plans/current-tracker.md' },
      ],
    ],
    [
      treeEndpoint,
      {
        truncated: false,
        tree: [
          { path: gatePath, mode: '100644', type: 'blob', sha: gateBlobSha },
          { path: admissionPath, mode: '100644', type: 'blob', sha: admissionBlobSha },
        ],
      },
    ],
    [
      `repos/interdomestik/interdomestik/git/blobs/${gateBlobSha}`,
      { sha: gateBlobSha, encoding: 'base64', content: gateBytes.toString('base64') },
    ],
    [
      `repos/interdomestik/interdomestik/git/blobs/${admissionBlobSha}`,
      {
        sha: admissionBlobSha,
        encoding: 'base64',
        content: admissionBytes.toString('base64'),
      },
    ],
  ]);
  const promotion = collectPromotionFacts(
    root,
    { promotionPrNumber: 1700 },
    endpoint => responses.get(endpoint),
    readCommit
  );
  assert.deepEqual(promotion.changedPaths, [
    gatePath,
    admissionPath,
    'docs/plans/current-program.md',
    'docs/plans/current-tracker.md',
  ]);
  assert.equal(promotion.inventoryComplete, true);
  assert.equal(promotion.gateSha256, createHash('sha256').update(gateBytes).digest('hex'));
  assert.equal(
    promotion.admissionSha256,
    createHash('sha256').update(admissionBytes).digest('hex')
  );
  assert.deepEqual(promotion.reviews[0].user, { login: 'arbenl', id: 62884977 });

  responses.get(treeEndpoint).tree[0].mode = '120000';
  assert.throws(
    () =>
      collectPromotionFacts(
        root,
        { promotionPrNumber: 1700 },
        endpoint => responses.get(endpoint),
        readCommit
      ),
    /regular blob/
  );
});

test('closeout ancestry and authority-path drift facts come from real Git history', () => {
  const root = gitFixture('lean-authority-closeout-fixture-');
  writeFileSync(join(root, 'terminal.txt'), 'terminal\n');
  git(root, 'add', 'terminal.txt');
  git(root, 'commit', '-m', 'terminal');
  const terminal = git(root, 'rev-parse', 'HEAD');
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  writeFileSync(join(root, 'docs/plans/current-program.md'), 'changed\n');
  git(root, 'add', 'docs/plans/current-program.md');
  git(root, 'commit', '-m', 'authority drift');
  const later = git(root, 'rev-parse', 'HEAD');
  assert.equal(isAncestor(root, terminal, later), true);
  assert.deepEqual(changedPathsBetween(root, terminal, later, ['docs/plans/current-program.md']), [
    'docs/plans/current-program.md',
  ]);
});

test('historical inactive state resolves through its active-to-inactive transition', () => {
  const root = gitFixture('lean-authority-transition-fixture-');
  const terminal = commitProjection(root, activeProjection, 'active terminal');
  const closeout = commitProjection(root, inactiveProjection, 'inactive closeout');
  writeFileSync(join(root, 'later.txt'), 'later\n');
  git(root, 'add', 'later.txt');
  git(root, 'commit', '-m', 'later unrelated main');
  const later = git(root, 'rev-parse', 'HEAD');
  const transition = locateAuthorityTransition(root, later);
  assert.deepEqual(
    [transition.kind, transition.terminalProjectionSha, transition.closeoutMergeSha],
    ['closeout_recorded', terminal, closeout]
  );
});

test('authority path edit then revert remains observable history drift', () => {
  const root = gitFixture('lean-authority-revert-fixture-');
  const terminal = commitProjection(root, inactiveProjection, 'terminal');
  commitProjection(root, activeProjection, 'temporary authority edit');
  const reverted = commitProjection(root, inactiveProjection, 'revert authority edit');
  assert.deepEqual(
    changedPathsBetween(root, terminal, reverted, ['docs/plans/current-program.md']),
    []
  );
  assert.equal(authorityPathsTouched(root, terminal, reverted), true);
});

test('Git and GitHub subprocess evidence is bounded by an execution timeout', () => {
  const source = readFileSync(new URL('./lean-current-authority-git.mjs', import.meta.url), 'utf8');
  assert.match(source, /timeout:\s*30_000/u);
});
