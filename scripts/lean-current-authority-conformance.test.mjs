import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  approvalMarker,
  classifyCloseoutPull,
  isBootstrapAnchor,
  isClosedUnmergedPull,
  parseAuthorityDocuments,
  resolveAuthority,
} from './lean-current-authority.mjs';
import { validT117BPredecessor } from './lean-exact-writer-exceptions.mjs';

const block = value =>
  `## Lean Authority\n\n\`\`\`json lean-authority\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const inactive = {
  schemaVersion: 1,
  authority: 'lean-tier12-v1',
  lifecycle: 'inactive',
  owner: { login: 'arbenl', id: 62884977 },
  activeSlice: null,
};

test('program and tracker must carry exactly agreeing canonical projections', () => {
  assert.equal(parseAuthorityDocuments(block(inactive), block(inactive)).lifecycle, 'inactive');
  assert.throws(
    () => parseAuthorityDocuments(block(inactive), block({ ...inactive, lifecycle: 'foreign' })),
    /lifecycle|disagree/
  );
  assert.throws(() => parseAuthorityDocuments('# missing', block(inactive)), /missing/);
});

test('repo-owned conformance CLI ignores external skill availability', () => {
  const root = mkdtempSync(join(tmpdir(), 'lean-authority-conformance-'));
  mkdirSync(join(root, 'docs/plans'), { recursive: true });
  writeFileSync(join(root, 'docs/plans/current-program.md'), `${block(inactive)}\n`);
  writeFileSync(join(root, 'docs/plans/current-tracker.md'), `${block(inactive)}\n`);
  const cli = new URL('./lean-current-authority.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [cli, 'conformance', `--repo=${root}`], {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin' },
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    [output.ok, output.lifecycle, output.runtimeAuthorized, output.activeSlice],
    [true, 'inactive', false, null]
  );
});

test('authority concerns remain split into bounded cohesive repo modules', () => {
  const modules = {
    facade: 'lean-current-authority.mjs',
    policy: 'lean-current-authority-policy.mjs',
    lifecycle: 'lean-current-authority-lifecycle.mjs',
    closeout: 'lean-current-authority-closeout.mjs',
    git: 'lean-current-authority-git.mjs',
    history: 'lean-current-authority-history.mjs',
    evidence: 'lean-current-authority-evidence.mjs',
  };
  const sources = Object.fromEntries(
    Object.entries(modules).map(([role, file]) => [
      role,
      readFileSync(new URL(file, import.meta.url), 'utf8'),
    ])
  );
  for (const [role, source] of Object.entries(sources)) {
    assert.ok(source.split('\n').length <= 200, `${role} module exceeds 200 physical lines`);
  }
  assert.doesNotMatch(sources.facade, /execFileSync|validateProjection/u);
  assert.doesNotMatch(sources.policy, /execFileSync|resolveAuthority/u);
  assert.doesNotMatch(sources.lifecycle, /execFileSync|readFileSync/u);
  assert.match(sources.git, /execFileSync/u);
  assert.doesNotMatch(sources.history, /execFileSync|readFileSync/u);
  assert.match(sources.evidence, /resolveRepositoryAuthority/u);
  assert.match(sources.evidence, /transition\.kind === 'closeout_recorded'/u);
  assert.match(sources.history, /collectT117BPredecessorEvidence|verifyCloseout/u);
  assert.doesNotMatch(
    sources.evidence,
    /terminalAnchorIsAncestor:\s*true|authorityPathsChangedAfterTerminal:\s*false/u
  );
  for (const name of [
    'APPROVAL_PREFIX',
    'approvalMarker',
    'classifyCloseoutPull',
    'classifyWriterPath',
    'compareCanonicalText',
    'isBootstrapAnchor',
    'isCanonicalOrigin',
    'isClosedUnmergedPull',
    'parseAuthorityDocuments',
    'resolveAuthority',
    'selectFullProductPull',
    'verifyCloseout',
  ]) {
    assert.match(
      sources.facade,
      new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`, 'su')
    );
  }
  assert.ok(sources.policy.includes('split(/[/._-]+/u)'));
  assert.ok(!sources.policy.includes('split(/[\\/._-]+/u)'));
});

test('only the frozen protected-main parent qualifies for bootstrap lineage', () => {
  assert.equal(isBootstrapAnchor('87f6dcc91e33abe51169fc95064fc585bd10d064'), true);
  assert.equal(isBootstrapAnchor('0'.repeat(40)), false);
});

test('raw closed-unmerged state needs no head commit or file inventory', () => {
  assert.equal(isClosedUnmergedPull({ state: 'closed', merged: false }), true);
  assert.equal(isClosedUnmergedPull({ state: 'closed', merged: true }), false);
  for (const merged of [undefined, null, 'false', 0]) {
    assert.equal(isClosedUnmergedPull({ state: 'closed', merged }), false);
  }
});

test('closeout abandonment requires exact closed and boolean unmerged evidence', () => {
  assert.equal(classifyCloseoutPull({ state: 'closed', merged: false }), 'abandoned');
  assert.equal(classifyCloseoutPull({ state: 'closed', merged: true }), 'continuing');
  assert.equal(classifyCloseoutPull({ state: 'open', merged: false }), 'continuing');
  assert.equal(classifyCloseoutPull(null), 'missing');
  for (const pull of [
    { state: 'closed' },
    { state: 'closed', merged: null },
    { state: 'closed', merged: 'false' },
    { state: 'OPEN', merged: false },
    { state: 'open', merged: true },
  ]) {
    assert.equal(classifyCloseoutPull(pull), 'malformed');
  }
});

test('closed PR precedence and incomplete inventories fail without runtime', () => {
  const [base, head, merge, tree] = ['0', '1', '2', '3'].map(value => value.repeat(40));
  const slice = {
    sliceId: 'IDA-UI-ONE',
    tier: 2,
    promotionPrNumber: 1,
    promotionBaseSha: base,
    expectedProductBranch: 'codex/ida-ui-one',
    gateSha256: 'a'.repeat(64),
    admissionSha256: 'b'.repeat(64),
    productWriterPaths: ['apps/web/src/app/[locale]/page.tsx'],
    closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
  };
  const owner = { login: 'arbenl', id: 62884977 };
  const promotion = {
    number: 1,
    state: 'CLOSED',
    merged: true,
    baseSha: base,
    headSha: head,
    headTree: tree,
    mergeSha: merge,
    mergeParents: [base],
    mergeTree: tree,
    changedPaths: [
      'docs/plans/2026-09-01-ui-one-design.md',
      'docs/plans/2026-09-01-ui-one-admission.json',
      'docs/plans/current-program.md',
      'docs/plans/current-tracker.md',
    ],
    inventoryComplete: true,
    gateSha256: slice.gateSha256,
    admissionSha256: slice.admissionSha256,
  };
  promotion.reviews = [
    { state: 'COMMENTED', body: approvalMarker(slice, head, tree), commitId: head, user: owner },
  ];
  const projection = {
    schemaVersion: 1,
    authority: 'lean-tier12-v1',
    lifecycle: 'promotion_pending',
    owner,
    activeSlice: slice,
  };
  const local = {
    branch: slice.expectedProductBranch,
    headSha: head,
    forkPointSha: merge,
    changedPaths: slice.productWriterPaths,
  };
  const closed = resolveAuthority(projection, {
    protectedMainSha: merge,
    promotion,
    product: { state: 'CLOSED', merged: false, inventoryComplete: false },
    local,
  });
  assert.deepEqual(
    [closed.lifecycle, closed.reason, closed.closeoutAuthorized],
    ['inactive', 'product_closed_unmerged', true]
  );
  const incomplete = resolveAuthority(projection, {
    protectedMainSha: merge,
    promotion,
    product: { state: 'OPEN', merged: false, inventoryComplete: false },
    local,
  });
  assert.deepEqual(
    [incomplete.lifecycle, incomplete.reason, incomplete.closeoutAuthorized],
    ['blocked', 'product_inventory_incomplete', true]
  );
  for (const merged of [undefined, null, 'false', 0]) {
    const malformed = resolveAuthority(projection, {
      protectedMainSha: merge,
      promotion,
      product: { state: 'CLOSED', merged },
      local,
    });
    assert.deepEqual(
      [malformed.lifecycle, malformed.reason, malformed.closeoutAuthorized],
      ['blocked', 'product_state_malformed', false]
    );
  }
  const malformedPromotion = resolveAuthority(projection, {
    protectedMainSha: merge,
    promotion: { ...promotion, merged: null },
    local,
  });
  assert.deepEqual(
    [malformedPromotion.reason, malformedPromotion.closeoutAuthorized],
    ['promotion_state_malformed', false]
  );
});

test('T117B children enforce root and exact predecessor merge-closeout order', () => {
  const admissions = Object.fromEntries(
    ['data', 'portal', 'cutover'].map(name => {
      const value = JSON.parse(
        readFileSync(
          new URL(`../docs/plans/2026-08-28-t117b-${name}-admission.json`, import.meta.url)
        )
      );
      return [
        value.sliceId,
        { sliceId: value.sliceId, tier: 3, productWriterPaths: value.writerPaths },
      ];
    })
  );
  const [head, tree, merge, closeout] = ['4', '5', '6', '7'].map(value => value.repeat(40));
  const verified = (childId, predecessorSliceId, predecessorWriterMapSha256) => ({
    status: 'verified',
    childId,
    predecessorSliceId,
    predecessorWriterMapSha256,
    productPrNumber: 1654,
    productState: 'CLOSED',
    productMerged: true,
    productHeadSha: head,
    productHeadTree: tree,
    productMergeSha: merge,
    closeoutState: 'deterministic_closeout_recorded',
    closeoutMergeSha: closeout,
  });
  const dataHash = '18b044d69363404d07682aca7b5944d440cbb1e0066d91cc0cf82578953e3f26';
  const portalHash = '60de5ce927812137cfdcd620d280d2708b488040ddf02a5796131d4c6c1f04a5';
  assert.equal(validT117BPredecessor(admissions['T117B-DATA']), true);
  const portalProof = verified('T117B-PORTAL', 'T117B-DATA', dataHash);
  const cutoverProof = verified('T117B-CUTOVER', 'T117B-PORTAL', portalHash);
  assert.equal(validT117BPredecessor(admissions['T117B-PORTAL'], portalProof), true);
  assert.equal(validT117BPredecessor(admissions['T117B-CUTOVER'], cutoverProof), true);
  for (const [slice, proof] of [
    [admissions['T117B-DATA'], { status: 'verified', childId: 'T117B-DATA' }],
    [admissions['T117B-PORTAL'], undefined],
    [admissions['T117B-PORTAL'], { ...portalProof, predecessorSliceId: 'T117B-CUTOVER' }],
    [admissions['T117B-PORTAL'], { ...portalProof, predecessorWriterMapSha256: 'f'.repeat(64) }],
    [admissions['T117B-PORTAL'], { ...portalProof, productMerged: false }],
    [admissions['T117B-PORTAL'], { ...portalProof, productMergeSha: 'foreign' }],
    [admissions['T117B-CUTOVER'], { ...portalProof, childId: 'T117B-CUTOVER' }],
  ]) {
    assert.equal(validT117BPredecessor(slice, proof), false);
  }
  const projection = activeSlice => ({
    ...inactive,
    lifecycle: 'promotion_pending',
    activeSlice: {
      ...activeSlice,
      promotionPrNumber: 1654,
      promotionBaseSha: '8'.repeat(40),
      expectedProductBranch: `codex/${activeSlice.sliceId.toLowerCase()}`,
      gateSha256: '9'.repeat(64),
      admissionSha256: 'a'.repeat(64),
      closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
    },
  });
  assert.equal(
    resolveAuthority(projection(admissions['T117B-PORTAL'])).reason,
    'predecessor_evidence_mismatch'
  );
});
