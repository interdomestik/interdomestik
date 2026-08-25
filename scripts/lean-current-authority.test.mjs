import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APPROVAL_PREFIX,
  approvalMarker,
  isCanonicalOrigin,
  resolveAuthority,
  verifyCloseout,
} from './lean-current-authority.mjs';

const [B0, HP, MP, H, M, P_TREE, H_TREE] = ['0', '1', '2', '3', '4', '5', '6'].map(value =>
  value.repeat(40)
);
const owner = { login: 'arbenl', id: 62884977 };
const slice = {
  sliceId: 'IDA-UI-HOME-MINIMAL-SHELL',
  tier: 2,
  promotionPrNumber: 1700,
  promotionBaseSha: B0,
  expectedProductBranch: 'codex/ida-ui-home-minimal-shell',
  gateSha256: 'a'.repeat(64),
  admissionSha256: 'b'.repeat(64),
  productWriterPaths: [
    'apps/web/src/app/[locale]/page.tsx',
    'apps/web/src/app/[locale]/page.test.tsx',
  ],
  closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
};

const projection = (activeSlice = slice) => ({
  schemaVersion: 1,
  authority: 'lean-tier12-v1',
  lifecycle: activeSlice ? 'promotion_pending' : 'inactive',
  owner,
  activeSlice,
});

function approval(overrides = {}) {
  return {
    state: 'COMMENTED',
    body: approvalMarker(slice, HP, P_TREE),
    commitId: HP,
    user: owner,
    ...overrides,
  };
}

function facts(overrides = {}) {
  return {
    protectedMainSha: MP,
    local: {
      branch: slice.expectedProductBranch,
      headSha: H,
      forkPointSha: MP,
      changedPaths: slice.productWriterPaths,
    },
    promotion: {
      number: slice.promotionPrNumber,
      state: 'CLOSED',
      merged: true,
      baseSha: B0,
      headSha: HP,
      headTree: P_TREE,
      mergeSha: MP,
      mergeParents: [B0],
      mergeTree: P_TREE,
      changedPaths: [
        'docs/plans/2026-09-01-home-minimal-shell-design.md',
        'docs/plans/2026-09-01-home-minimal-shell-admission.json',
        'docs/plans/current-program.md',
        'docs/plans/current-tracker.md',
      ],
      inventoryComplete: true,
      gateSha256: slice.gateSha256,
      admissionSha256: slice.admissionSha256,
      reviews: [approval()],
    },
    product: null,
    ...overrides,
  };
}

test('canonical approval binds exact owner identity, head and marker', () => {
  assert.match(approval().body, new RegExp(`^${APPROVAL_PREFIX}\\n`));
  assert.equal(resolveAuthority(projection(), facts()).lifecycle, 'active_implementation');
  for (const review of [
    approval({ state: 'APPROVED' }),
    approval({ user: { ...owner, login: 'foreign' } }),
    approval({ user: { ...owner, id: owner.id + 1 } }),
    approval({ commitId: H }),
    approval({ body: `${approval().body}\nextra` }),
  ]) {
    const result = resolveAuthority(
      projection(),
      facts({ promotion: { ...facts().promotion, reviews: [review] } })
    );
    assert.equal(result.runtimeAuthorized, false);
    assert.equal(result.reason, 'promotion_approval_missing');
  }
  assert.equal(
    resolveAuthority(
      projection(),
      facts({ promotion: { ...facts().promotion, reviews: [approval(), approval()] } })
    ).reason,
    'promotion_approval_missing'
  );
});

test('promotion requires exact parent and tree equivalence', () => {
  const wrongParent = facts();
  wrongParent.promotion.mergeParents = [H];
  assert.equal(resolveAuthority(projection(), wrongParent).reason, 'promotion_identity_mismatch');
  const wrongTree = facts();
  wrongTree.promotion.mergeTree = H_TREE;
  assert.equal(resolveAuthority(projection(), wrongTree).reason, 'promotion_identity_mismatch');
});

test('promotion requires a complete authority-only changed-file inventory', () => {
  for (const promotion of [
    { ...facts().promotion, inventoryComplete: false },
    { ...facts().promotion, inventoryComplete: undefined },
    {
      ...facts().promotion,
      changedPaths: [...facts().promotion.changedPaths, 'apps/web/src/app/[locale]/page.tsx'],
    },
    { ...facts().promotion, gateSha256: 'c'.repeat(64) },
    { ...facts().promotion, admissionSha256: 'd'.repeat(64) },
  ]) {
    const result = resolveAuthority(projection(), facts({ promotion }));
    assert.equal(result.runtimeAuthorized, false);
    assert.equal(result.reason, 'promotion_scope_mismatch');
  }
});

test('only the expected downstream branch may use temporary authority', () => {
  const wrong = facts({ local: { branch: 'codex/foreign', headSha: H, forkPointSha: MP } });
  assert.equal(resolveAuthority(projection(), wrong).reason, 'wrong_continuation_branch');
  const wrongFork = facts({
    local: { branch: slice.expectedProductBranch, headSha: H, forkPointSha: B0 },
  });
  assert.equal(resolveAuthority(projection(), wrongFork).reason, 'wrong_product_fork');
  const missingInventory = facts({
    local: { branch: slice.expectedProductBranch, headSha: H, forkPointSha: MP },
  });
  assert.equal(
    resolveAuthority(projection(), missingInventory).reason,
    'product_writer_map_mismatch'
  );
});

test('an open product PR authorizes only its exact local or detached head', () => {
  const product = {
    state: 'OPEN',
    merged: false,
    baseSha: MP,
    headRef: slice.expectedProductBranch,
    headSha: H,
    changedPaths: slice.productWriterPaths,
    inventoryComplete: true,
  };
  const exact = facts({
    product,
    local: {
      branch: slice.expectedProductBranch,
      headSha: H,
      forkPointSha: MP,
      changedPaths: slice.productWriterPaths,
    },
  });
  assert.equal(resolveAuthority(projection(), exact).runtimeAuthorized, true);
  assert.equal(
    resolveAuthority(projection(), { ...exact, local: { ...exact.local, branch: 'main' } })
      .runtimeAuthorized,
    false
  );
});

test('protected promotion main is awaiting the exact branch without granting runtime', () => {
  const result = resolveAuthority(
    projection(),
    facts({ local: { branch: 'main', headSha: MP, forkPointSha: MP } })
  );
  assert.deepEqual(
    [result.lifecycle, result.runtimeAuthorized, result.activeSlice],
    ['awaiting_product_branch', false, slice.sliceId]
  );
});

test('live closed-unmerged product state disables runtime immediately', () => {
  const product = {
    state: 'CLOSED',
    merged: false,
    baseSha: MP,
    headRef: slice.expectedProductBranch,
    headSha: H,
    headTree: H_TREE,
    changedPaths: slice.productWriterPaths,
  };
  const result = resolveAuthority(projection(), facts({ product }));
  assert.deepEqual(
    [result.lifecycle, result.runtimeAuthorized, result.activeSlice, result.successorsBlocked],
    ['inactive', false, null, true]
  );
  assert.equal(result.reason, 'product_closed_unmerged');
  assert.equal(result.closeoutAuthorized, true);
});

test('closed-unmerged promotion returns inactive with failure closeout only', () => {
  const promotion = { ...facts().promotion, merged: false };
  const result = resolveAuthority(projection(), facts({ promotion }));
  assert.deepEqual(
    [result.lifecycle, result.runtimeAuthorized, result.activeSlice, result.closeoutAuthorized],
    ['inactive', false, null, true]
  );
  assert.equal(result.reason, 'promotion_closed_unmerged');
});

test('foreign main advance fails closed while intended squash merge consumes authority', () => {
  assert.equal(
    resolveAuthority(projection(), facts({ protectedMainSha: B0 })).reason,
    'foreign_main_advance'
  );
  const product = {
    state: 'CLOSED',
    merged: true,
    baseSha: MP,
    headRef: slice.expectedProductBranch,
    headSha: H,
    headTree: H_TREE,
    mergeSha: M,
    mergeParents: [MP],
    mergeTree: H_TREE,
    changedPaths: slice.productWriterPaths,
    inventoryComplete: true,
  };
  const result = resolveAuthority(projection(), facts({ protectedMainSha: M, product }));
  assert.deepEqual(
    [result.lifecycle, result.runtimeAuthorized, result.activeSlice, result.closeoutAuthorized],
    ['consumed_on_merge', false, null, true]
  );
});

test('local authority accepts only the canonical GitHub origin identity', () => {
  assert.equal(isCanonicalOrigin('https://github.com/interdomestik/interdomestik.git'), true);
  assert.equal(isCanonicalOrigin('git@github.com:interdomestik/interdomestik.git'), true);
  assert.equal(isCanonicalOrigin('https://github.com/foreign/interdomestik.git'), false);
  assert.equal(isCanonicalOrigin('/tmp/interdomestik'), false);
});

test('inactive projection cannot be activated by historical or external evidence', () => {
  const result = resolveAuthority(projection(null), {
    ...facts(),
    wf01: { runtimeAuthorized: true },
    externalSkill: { runtimeAuthorized: true },
  });
  assert.deepEqual([result.lifecycle, result.activeSlice], ['inactive', null]);
});

test('closeout is exact projection-only delivery and never restores runtime', () => {
  const closeout = {
    state: 'CLOSED',
    prBaseSha: M,
    headRef: `${slice.expectedProductBranch}-closeout`,
    expectedHeadRef: `${slice.expectedProductBranch}-closeout`,
    terminalAnchorIsAncestor: true,
    authorityPathsChangedAfterTerminal: false,
    baseSha: M,
    headTree: P_TREE,
    mergeSha: B0,
    mergeParents: [M],
    mergeTree: P_TREE,
    protectedMainSha: B0,
    changedPaths: slice.closeoutWriterPaths,
    inventoryComplete: true,
  };
  const result = verifyCloseout(projection(null), closeout);
  assert.deepEqual(
    [result.lifecycle, result.runtimeAuthorized, result.activeSlice],
    ['no_active_slice', false, null]
  );
  assert.equal(
    verifyCloseout(projection(null), {
      ...closeout,
      authorityPathsChangedAfterTerminal: true,
    }).reason,
    'closeout_identity_mismatch'
  );
  for (const inventoryComplete of [false, undefined]) {
    assert.equal(
      verifyCloseout(projection(null), { ...closeout, inventoryComplete }).reason,
      'closeout_identity_mismatch'
    );
  }
});
