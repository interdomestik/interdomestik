import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveRepositoryAuthority as resolveRepo } from './lean-current-authority.mjs';
import { assertCanonicalWriterWorktree as assertWriter } from './lean-current-authority-evidence.mjs';
import {
  changedPathsBetween as changed,
  collectPromotionFacts as collect,
  git,
  isAncestor,
  pullFacts,
} from './lean-current-authority-git.mjs';
import {
  authorityPathsTouched,
  locateAuthorityTransition as locate,
} from './lean-current-authority-history.mjs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const plans = 'docs/plans';
const program = `${plans}/current-program.md`;
const tracker = `${plans}/current-tracker.md`;
const block = value =>
  `## Lean Authority\n\n\`\`\`json lean-authority\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
const blob = bytes =>
  createHash('sha1')
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
    .digest('hex');
const inactive = {
  schemaVersion: 1,
  authority: 'lean-tier12-v1',
  lifecycle: 'inactive',
  owner: { login: 'arbenl', id: 62884977 },
  activeSlice: null,
};
const active = {
  ...inactive,
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
    closeoutWriterPaths: [program, tracker],
  },
};

function commit(root, projection, message) {
  mkdirSync(join(root, plans), { recursive: true });
  for (const name of ['current-program.md', 'current-tracker.md']) {
    writeFileSync(join(root, plans, name), block(projection));
  }
  git(root, 'add', program, tracker);
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function fixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  git(root, 'init');
  git(root, 'config', 'user.email', 'fixture@interdomestik.test');
  git(root, 'config', 'user.name', 'Fixture');
  return root;
}

test('writer authority rejects skip-worktree', () => {
  const root = fixture('lean-authority-writer-worktree-');
  writeFileSync(join(root, 'tracked.txt'), 'canonical\n');
  git(root, 'add', 'tracked.txt');
  git(root, 'commit', '-m', 'canonical');

  assert.doesNotThrow(() => assertWriter(root));
  git(root, 'update-index', '--skip-worktree', 'tracked.txt');
  assert.throws(() => assertWriter(root), /tracked skip-worktree state blocks Lean activation/u);
  assert.doesNotThrow(() => assertWriter(root, false));

  git(root, 'update-index', '--assume-unchanged', 'tracked.txt');
  assert.match(git(root, 'ls-files', '-v', 'tracked.txt'), /^s /u);
  assert.throws(() => assertWriter(root), /tracked skip-worktree state blocks Lean activation/u);
});

test('repository boundary is fail-closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'lean-authority-malformed-'));
  mkdirSync(join(root, plans), { recursive: true });
  for (const name of ['current-program.md', 'current-tracker.md']) {
    writeFileSync(join(root, plans, name), '```json lean-authority\n{"not":"canonical"}\n```\n');
  }
  assert.doesNotThrow(() => resolveRepo(root, true));
  assert.equal(resolveRepo(root, true).reason, 'authority_evidence_unavailable');
});

test('pull fixtures bind GitHub evidence', () => {
  const root = fixture('lean-authority-git-fixture-');
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
  const gateBlobSha = blob(gateBytes);
  const admissionBlobSha = blob(admissionBytes);
  const pull = {
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
  const facts = pullFacts(root, pull, [], readCommit);
  assert.deepEqual(facts.mergeParents, [base]);
  assert.equal(facts.headTree, git(root, 'rev-parse', `${head}^{tree}`));
  assert.equal(facts.mergeTree, facts.headTree);
  const treeEndpoint = `repos/interdomestik/interdomestik/git/trees/${facts.headTree}?recursive=1`;

  const responses = new Map([
    ['repos/interdomestik/interdomestik/pulls/1700', pull],
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
        { filename: program },
        { filename: tracker },
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
  const promotion = collect(
    root,
    { promotionPrNumber: 1700 },
    endpoint => responses.get(endpoint),
    readCommit
  );
  assert.deepEqual(promotion.changedPaths, [gatePath, admissionPath, program, tracker]);
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
      collect(root, { promotionPrNumber: 1700 }, endpoint => responses.get(endpoint), readCommit),
    /regular blob/
  );
});

test('closeout ancestry uses Git history', () => {
  const root = fixture('lean-authority-closeout-fixture-');
  writeFileSync(join(root, 'terminal.txt'), 'terminal\n');
  git(root, 'add', 'terminal.txt');
  git(root, 'commit', '-m', 'terminal');
  const terminal = git(root, 'rev-parse', 'HEAD');
  mkdirSync(join(root, plans), { recursive: true });
  writeFileSync(join(root, program), 'changed\n');
  git(root, 'add', program);
  git(root, 'commit', '-m', 'authority drift');
  const later = git(root, 'rev-parse', 'HEAD');
  assert.equal(isAncestor(root, terminal, later), true);
  assert.deepEqual(changed(root, terminal, later, [program]), [program]);
});

test('inactive history resolves closeout', () => {
  const root = fixture('lean-authority-transition-fixture-');
  const terminal = commit(root, active, 'active terminal');
  const closeout = commit(root, inactive, 'inactive closeout');
  writeFileSync(join(root, 'later.txt'), 'later\n');
  git(root, 'add', 'later.txt');
  git(root, 'commit', '-m', 'later unrelated main');
  const later = git(root, 'rev-parse', 'HEAD');
  const transition = locate(root, later);
  assert.deepEqual(
    [transition.kind, transition.terminalProjectionSha, transition.closeoutMergeSha],
    ['closeout_recorded', terminal, closeout]
  );
  const prior = structuredClone(active);
  Object.assign(prior.activeSlice, {
    sliceId: 'T117B-CUTOVER',
    tier: 3,
    promotionBaseSha: closeout,
    productWriterPaths: [
      ...[
        'gate/member-diaspora',
        'gate/member-home-cta',
        'golden/member-portal-agent-consumer',
        'golden/member-dashboard-empty-state',
        'golden/member-dashboard-has-claims',
        'production',
        'smoke/ida-dashboard-smoke',
        'ui-v2-onboarding',
      ].map(path => `apps/web/e2e/${path}.spec.ts`),
      ...['_core.entry.test', '_core.entry', 'page.test', 'page'].map(
        path => `apps/web/src/app/[locale]/(app)/member/${path}.tsx`
      ),
    ],
  });
  assert.equal(prior.activeSlice.productWriterPaths.length, 12);
  const base = commit(root, prior, 'prior cutover');
  const repeat = locate(root, base, 'T117B-CUTOVER');
  assert.equal(repeat.kind, 'closeout_recorded');
});

test('authority edit-revert remains history drift', () => {
  const root = fixture('lean-authority-revert-fixture-');
  const terminal = commit(root, inactive, 'terminal');
  commit(root, active, 'temporary authority edit');
  const reverted = commit(root, inactive, 'revert authority edit');
  assert.deepEqual(changed(root, terminal, reverted, [program]), []);
  assert.equal(authorityPathsTouched(root, terminal, reverted), true);
});

test('Git evidence uses a bounded timeout', () => {
  assert.match(source('./lean-current-authority-git.mjs'), /timeout:\s*30_000/u);
});

test('closeout selection uses its recorded merge', () => {
  assert.match(source('./lean-current-authority-evidence.mjs'), /transition\.closeoutMergeSha/u);
  assert.match(
    source('./lean-current-authority-history.mjs'),
    /pullByBranch\(repo, branch, transition\.closeoutMergeSha\)/u
  );
});
