import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeoutPull,
  historicalCloseoutPull,
} from './lean-current-authority-historical-closeout.mjs';

const base = '3a5f6b28d2a0497a8bf4f798a2a3720c6163004a';
const merge = '7595d063493d397ec47d4376604b31b6bd7197ef';
const transition = {
  terminalProjectionSha: base,
  closeoutMergeSha: merge,
  prior: { activeSlice: { sliceId: 'T-117C', expectedProductBranch: 'codex/t117c-rendering-r4' } },
};
const pull = {
  number: 1726,
  state: 'closed',
  merged: true,
  base: { sha: base },
  head: {
    ref: 'codex/t117c-no-js-failure-closeout',
    sha: '18c1806e5db2180d6249bd4b7a63b727086b5619',
  },
  merge_commit_sha: merge,
};
test('historical locator admits only exact #1726 identity and leaves proof to closeout verifier', () => {
  const result = historicalCloseoutPull('/repo', transition, (endpoint, repo) => {
    assert.equal(endpoint, 'repos/interdomestik/interdomestik/pulls/1726');
    assert.equal(repo, '/repo');
    return pull;
  });
  assert.equal(result.pull, pull);
  assert.equal(result.branch, pull.head.ref);
  for (const bad of [
    { ...pull, number: 1727 },
    { ...pull, state: 'open' },
    { ...pull, merged: false },
    { ...pull, base: { sha: 'a'.repeat(40) } },
    { ...pull, head: { ...pull.head, sha: 'a'.repeat(40) } },
    { ...pull, head: { ...pull.head, ref: 'codex/other-closeout' } },
    { ...pull, merge_commit_sha: 'a'.repeat(40) },
  ])
    assert.throws(() => historicalCloseoutPull('/repo', transition, () => bad), /PR mismatch/);
  assert.throws(
    () =>
      historicalCloseoutPull(
        '/repo',
        { ...transition, terminalProjectionSha: 'a'.repeat(40) },
        () => pull
      ),
    /transition mismatch/
  );
  assert.throws(
    () =>
      historicalCloseoutPull(
        '/repo',
        {
          ...transition,
          prior: { activeSlice: { ...transition.prior.activeSlice, sliceId: 'T117B-CUTOVER' } },
        },
        () => pull
      ),
    /transition mismatch/
  );
  assert.equal(
    historicalCloseoutPull('/repo', { ...transition, closeoutMergeSha: 'a'.repeat(40) }, () =>
      assert.fail('unrelated transition must use normal lookup')
    ),
    null
  );
});

test('located historical PR still passes normal commit, inventory and closeout verification', async () => {
  const { pullFacts, attachPullFiles } = await import('./lean-current-authority-git.mjs');
  const { verifyCloseout } = await import('./lean-current-authority-closeout.mjs');
  const tree = '4f64bf7136092c9abc226acc861b37efef212893';
  const paths = ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'];
  const selected = historicalCloseoutPull('/repo', transition, () => ({
    ...pull,
    changed_files: 2,
  }));
  const full = attachPullFiles(
    '/repo',
    pullFacts('/repo', selected.pull, [], (_repo, sha) => {
      assert.ok([pull.head.sha, merge].includes(sha));
      return { tree, parents: [base] };
    }),
    () => paths.map(filename => ({ filename }))
  );
  const projection = {
    schemaVersion: 1,
    authority: 'lean-tier12-v1',
    lifecycle: 'inactive',
    owner: { login: 'arbenl', id: 62884977 },
    activeSlice: null,
  };
  const facts = {
    ...full,
    prBaseSha: full.baseSha,
    expectedHeadRef: selected.branch,
    terminalAnchorIsAncestor: true,
    authorityPathsChangedAfterTerminal: false,
    baseSha: base,
    protectedMainSha: merge,
  };
  assert.equal(verifyCloseout(projection, facts).reason, 'deterministic_closeout_recorded');
  for (const mutation of [
    { mergeTree: 'a'.repeat(40) },
    { mergeParents: ['a'.repeat(40)] },
    { changedPaths: [...paths, 'apps/web/src/proxy.ts'] },
    { inventoryComplete: false },
    { headRef: 'codex/other-closeout' },
    { terminalAnchorIsAncestor: false },
    { authorityPathsChangedAfterTerminal: true },
  ])
    assert.equal(
      verifyCloseout(projection, { ...facts, ...mutation }).reason,
      'closeout_identity_mismatch'
    );
});

test('collector wrapper preserves normal branch lookup and pins historical lookup', () => {
  const other = { ...transition, closeoutMergeSha: 'a'.repeat(40) };
  const normal = closeoutPull(
    '/repo',
    other,
    () => assert.fail('historical lookup'),
    (repo, branch, anchor) => {
      assert.equal(repo, '/repo');
      assert.equal(branch, 'codex/t117c-rendering-r4-closeout');
      assert.equal(anchor, other.closeoutMergeSha);
      return null;
    }
  );
  assert.deepEqual(normal, { branch: 'codex/t117c-rendering-r4-closeout', pull: null });
  assert.equal(
    closeoutPull(
      '/repo',
      transition,
      () => pull,
      () => assert.fail('normal lookup')
    ).pull,
    pull
  );
});
