import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { approvalMarker } from './lean-current-authority-policy.mjs';
import { resolveAuthority } from './lean-current-authority-lifecycle.mjs';
import { createRecoveryContext, collectLocalFacts } from './lean-current-authority-recovery.mjs';
import {
  digest,
  observation,
  sha,
  operationRequest,
  receipt,
  isolatedRoot,
  liveFacts,
  memberWriterPaths,
} from './slice-rehearse-operation-recovery-fixtures.mjs';
import { recoveryApprovalBinding } from './slice-rehearse-operation-certificate.mjs';
import { approvalReceiptPath, runSafeOperation } from './slice-rehearse-ops.mjs';

function fixture() {
  const owner = { login: 'arbenl', id: 62884977 };
  const slice = {
    sliceId: 'T-116-CASE-SUMMARY',
    tier: 2,
    promotionPrNumber: 1700,
    promotionBaseSha: sha('0'),
    expectedProductBranch: 'codex/t116-case-summary',
    gateSha256: 'a'.repeat(64),
    admissionSha256: 'b'.repeat(64),
    productWriterPaths: memberWriterPaths,
    closeoutWriterPaths: ['docs/plans/current-program.md', 'docs/plans/current-tracker.md'],
  };
  const projection = {
    schemaVersion: 1,
    authority: 'lean-tier12-v1',
    lifecycle: 'promotion_pending',
    owner,
    activeSlice: slice,
  };
  const promotion = {
    number: 1700,
    state: 'CLOSED',
    merged: true,
    baseSha: sha('0'),
    headSha: sha('1'),
    headTree: sha('5'),
    mergeSha: sha('2'),
    mergeParents: [sha('0')],
    mergeTree: sha('5'),
    inventoryComplete: true,
    changedPaths: [
      'docs/plans/2026-09-01-home-minimal-shell-design.md',
      'docs/plans/2026-09-01-home-minimal-shell-admission.json',
      'docs/plans/current-program.md',
      'docs/plans/current-tracker.md',
    ],
    gateSha256: slice.gateSha256,
    admissionSha256: slice.admissionSha256,
    reviews: [
      {
        state: 'COMMENTED',
        body: approvalMarker(slice, sha('1'), sha('5')),
        commitId: sha('1'),
        user: owner,
      },
    ],
  };
  const execution = {
    baseSha: sha('7'),
    headSha: sha('3'),
    treeSha: sha('6'),
    remoteHeadSha: sha('3'),
  };
  const facts = {
    protectedMainSha: execution.baseSha,
    promotion,
    product: null,
    local: {
      branch: slice.expectedProductBranch,
      headSha: execution.headSha,
      treeSha: execution.treeSha,
      forkPointSha: execution.baseSha,
      changedPaths: slice.productWriterPaths,
    },
  };
  const observed = observation(execution, {
    sliceId: slice.sliceId,
    scopeSha256: digest(projection),
  });
  return { projection, facts, observed, context: createRecoveryContext(() => observed) };
}

test('benign main advance requires a trusted context and keeps promotion identity intact', () => {
  const f = fixture(),
    before = structuredClone(f.facts.promotion);
  assert.equal(resolveAuthority(f.projection, f.facts).reason, 'foreign_main_advance');
  assert.equal(resolveAuthority(f.projection, f.facts, {}).runtimeAuthorized, false);
  assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, true);
  assert.deepEqual(f.facts.promotion, before);
});

test('every material dependency drift holds even with unchanged writers', () => {
  for (const key of Object.keys(fixture().observed.material)) {
    const f = fixture();
    f.observed.material[key] = digest('changed');
    assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, false, key);
  }
});

test('revocation, missing evidence, wrong scope, ancestry and exact identity all hold', () => {
  const mutations = [
    s => {
      s.approval.valid = false;
    },
    s => {
      s.complete = false;
    },
    s => {
      s.scopeSha256 = digest('other');
    },
    s => {
      s.promotionIsAncestor = false;
    },
    s => {
      s.execution.headSha = sha('9');
    },
    s => {
      delete s.material.protection;
    },
  ];
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f.observed);
    assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, false);
  }
});

test('open and merged product paths use validated execution base', () => {
  const f = fixture(),
    e = f.observed.execution;
  f.facts.product = {
    state: 'OPEN',
    merged: false,
    baseSha: e.baseSha,
    headRef: f.projection.activeSlice.expectedProductBranch,
    headSha: e.headSha,
    headTree: e.treeSha,
    inventoryComplete: true,
    changedPaths: f.facts.local.changedPaths,
  };
  assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, true);
  Object.assign(f.facts.product, {
    state: 'CLOSED',
    merged: true,
    mergeSha: sha('8'),
    mergeTree: e.treeSha,
    mergeParents: [e.baseSha],
  });
  f.facts.protectedMainSha = f.observed.protectedMainSha = sha('8');
  assert.equal(resolveAuthority(f.projection, f.facts, f.context).lifecycle, 'consumed_on_merge');
  f.facts.protectedMainSha = f.observed.protectedMainSha = sha('9');
  assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, false);
  assert.notEqual(
    resolveAuthority(f.projection, f.facts, f.context).lifecycle,
    'consumed_on_merge'
  );
});

test('recovery cannot override a missing promotion approval or inactive projection', () => {
  const f = fixture();
  f.facts.promotion.reviews = [];
  assert.equal(
    resolveAuthority(f.projection, f.facts, f.context).reason,
    'promotion_approval_missing'
  );
  assert.equal(
    resolveAuthority(
      { ...f.projection, lifecycle: 'inactive', activeSlice: null },
      f.facts,
      f.context
    ).runtimeAuthorized,
    false
  );
});

test('actual resolver and executor recover a benign base advance with one semantic receipt', t => {
  const f = fixture(),
    root = isolatedRoot(t),
    slice = f.projection.activeSlice;
  const overrides = {
    sliceId: slice.sliceId,
    branch: slice.expectedProductBranch,
    writerClosure: [...slice.productWriterPaths].sort(),
    treeSha: f.observed.execution.treeSha,
  };
  overrides.writerMapDigest = digest(overrides.writerClosure);
  const approvedRequest = operationRequest(sha('2'), sha('1'), overrides);
  const request = operationRequest(
    f.observed.execution.baseSha,
    f.observed.execution.headSha,
    overrides
  );
  const approved = approvedRequest.authorityCertificate,
    c = request.authorityCertificate;
  fs.writeFileSync(approvalReceiptPath(approved, root), receipt, { mode: 0o600 });
  Object.assign(f.observed.approval, {
    bindingSha256: approved.approvalBindingSha256,
    semanticSha256: recoveryApprovalBinding(approved),
  });
  let effects = 0;
  const options = {
    root,
    readLiveFacts: () => liveFacts(c),
    readAuthority: () => ({
      source: 'live-resolver',
      ...resolveAuthority(f.projection, f.facts, f.context),
    }),
    reconcile: () => ({ outcome: 'unknown' }),
    recovery: {
      context: f.context,
      approvedRequest,
      executeConditional: (_command, s) => {
        assert.deepEqual(s.execution, f.observed.execution);
        effects++;
      },
      reconcilePrior: prior => ({ attemptSha256: prior.attemptSha256, outcome: 'applied' }),
    },
  };
  assert.equal(runSafeOperation(request, options).status, 'failed_unknown');
  assert.equal(effects, 1);
  assert.equal(fs.readdirSync(root).filter(name => name.endsWith('.receipt')).length, 1);
  f.facts.product = {
    state: 'CLOSED',
    merged: true,
    baseSha: c.baseSha,
    headRef: c.branch,
    headSha: c.headSha,
    headTree: c.treeSha,
    mergeSha: sha('9'),
    mergeTree: c.treeSha,
    mergeParents: [c.baseSha],
    inventoryComplete: true,
    changedPaths: slice.productWriterPaths,
  };
  f.facts.protectedMainSha = f.observed.protectedMainSha = sha('9');
  assert.equal(options.readAuthority().lifecycle, 'consumed_on_merge');
  assert.equal(runSafeOperation(request, options).status, 'already_applied');
  assert.equal(effects, 1);
});

test('local collection binds its exact recovery snapshot and verifies Git ancestry', () => {
  const f = fixture(),
    e = f.observed.execution;
  const git = (_repo, ...args) => {
    if (args[0] === 'merge-base')
      return args[1] === f.facts.promotion.mergeSha ? f.facts.promotion.mergeSha : e.baseSha;
    if (args[0] === 'branch') return f.projection.activeSlice.expectedProductBranch;
    return args[1] === 'HEAD' ? e.headSha : e.treeSha;
  };
  f.facts.local = collectLocalFacts(
    '/repo',
    f.facts.promotion.mergeSha,
    f.context,
    git,
    () => f.projection.activeSlice.productWriterPaths
  );
  assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, true);
  f.observed.approval.generation += 1;
  assert.equal(resolveAuthority(f.projection, f.facts, f.context).runtimeAuthorized, false);
  assert.throws(
    () =>
      collectLocalFacts(
        '/repo',
        f.facts.promotion.mergeSha,
        f.context,
        (_repo, ...args) => (args[0] === 'merge-base' ? sha('f') : git(_repo, ...args)),
        () => []
      ),
    /local recovery ancestry/u
  );
});
