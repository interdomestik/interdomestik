import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { generateSliceCheckpoint, verifyCheckpointGitIdentity } from './slice-rehearse-report.mjs';

const sha = character => character.repeat(40);
const verified = {
  verifyState: input => ({
    verified: true,
    counters: Object.fromEntries(
      ['approvals', 'reFreezes', 'retries', 'heavyProofs', 'duplicateHeavyProofs'].map(key => [
        key,
        input[key],
      ])
    ),
  }),
};

test('checkpoint uses installed GitHub CLI with provider-only auth', () => {
  const source = fs.readFileSync(new URL('./slice-rehearse-report.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /execFileSync\(\s*'\/usr\/bin\/gh'/u);
  assert.match(source, /resolveGhBinary\(\)[\s\S]{0,250}execOptions\('gh'\)/u);
});

test('final checkpoint preserves candidate base while binding protected main to the merge', () => {
  const input = {
    stage: 'final',
    baseSha: sha('a'),
    headSha: sha('b'),
    treeSha: sha('c'),
    mergeSha: sha('d'),
  };
  assert.equal(
    verifyCheckpointGitIdentity(input, {
      headSha: input.headSha,
      treeSha: input.treeSha,
      protectedMainSha: input.mergeSha,
      baseIsAncestor: true,
    }),
    true
  );
  assert.equal(
    verifyCheckpointGitIdentity(input, {
      headSha: input.headSha,
      treeSha: input.treeSha,
      protectedMainSha: input.baseSha,
      baseIsAncestor: true,
    }),
    false
  );
  assert.equal(
    verifyCheckpointGitIdentity(input, {
      headSha: input.headSha,
      treeSha: input.treeSha,
      protectedMainSha: input.mergeSha,
      baseIsAncestor: false,
    }),
    false
  );
});

test('compiles one legal next action instead of accepting caller-authored authority', () => {
  const report = generateSliceCheckpoint(
    {
      schemaVersion: 1,
      stage: 'authority_hold',
      sliceId: 'HARNESS-V2-1',
      baseSha: sha('a'),
      headSha: sha('b'),
      treeSha: sha('c'),
      prNumber: 1700,
      mergeSha: null,
      approvals: 1,
      reFreezes: 0,
      retries: 3,
      heavyProofs: 1,
      duplicateHeavyProofs: 0,
      runnerMinutes: null,
      modelCostUsd: null,
      blockerPhase: 'approval',
      scopeDrift: [],
    },
    verified
  );
  assert.equal(report.legalNextAction, 'HOLD');
  assert.equal(report.runnerMinutes, null);
  assert.equal(report.modelCostUsd, null);
  assert.equal(Object.hasOwn(report, 'legalNextActions'), false);
});

test('post-merge closeout stays explicit when cleanup is fail-closed', () => {
  const report = generateSliceCheckpoint(
    {
      schemaVersion: 1,
      stage: 'authority_hold',
      sliceId: 'HARNESS-V2-2',
      baseSha: sha('a'),
      headSha: sha('b'),
      treeSha: sha('c'),
      prNumber: 1700,
      mergeSha: sha('d'),
      approvals: 1,
      reFreezes: 0,
      retries: 1,
      heavyProofs: 1,
      duplicateHeavyProofs: 0,
      runnerMinutes: null,
      modelCostUsd: null,
      blockerPhase: 'cleanup_hold:crash-safe-consumption-unproven',
      scopeDrift: [],
    },
    verified
  );
  assert.equal(report.legalNextAction, 'HOLD');
  assert.match(report.blockerPhase, /^cleanup_hold:/u);
});

test('rejects a caller-supplied next action even when it matches the compiler result', () => {
  const input = {
    schemaVersion: 1,
    stage: 'checkpoint',
    sliceId: 'HARNESS-V2-2',
    baseSha: sha('a'),
    headSha: sha('b'),
    treeSha: sha('c'),
    prNumber: null,
    mergeSha: null,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    heavyProofs: 0,
    duplicateHeavyProofs: 0,
    runnerMinutes: null,
    modelCostUsd: null,
    blockerPhase: 'none',
    scopeDrift: [],
    legalNextActions: ['request_delivery_approval'],
  };
  assert.throws(() => generateSliceCheckpoint(input, verified), /keys|caller-supplied/u);
});

test('rejects duplicate proof and invalid exact state', () => {
  const base = {
    schemaVersion: 1,
    stage: 'checkpoint',
    sliceId: 'HARNESS-V2-1',
    baseSha: sha('a'),
    headSha: sha('b'),
    treeSha: sha('c'),
    prNumber: null,
    mergeSha: null,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    heavyProofs: 0,
    duplicateHeavyProofs: 0,
    runnerMinutes: 0,
    modelCostUsd: null,
    blockerPhase: 'none',
    scopeDrift: [],
  };
  assert.throws(
    () => generateSliceCheckpoint({ ...base, duplicateHeavyProofs: 1 }, verified),
    /duplicate heavy proof/u
  );
  assert.throws(() => generateSliceCheckpoint({ ...base, treeSha: null }, verified), /tree SHA/u);
});

test('final stage requires verified terminal PR, merge, proof, and closeout invariants', () => {
  const final = {
    schemaVersion: 1,
    stage: 'final',
    sliceId: 'HARNESS-V2-1',
    baseSha: sha('a'),
    headSha: sha('b'),
    treeSha: sha('c'),
    prNumber: 1700,
    mergeSha: sha('d'),
    approvals: 1,
    reFreezes: 1,
    retries: 2,
    heavyProofs: 1,
    duplicateHeavyProofs: 0,
    runnerMinutes: null,
    modelCostUsd: null,
    blockerPhase: 'none',
    scopeDrift: [],
  };
  assert.equal(generateSliceCheckpoint(final, verified).stage, 'final');
  for (const invalid of [
    { mergeSha: null },
    { prNumber: null },
    { approvals: 0 },
    { heavyProofs: 0 },
    { blockerPhase: 'review' },
    { scopeDrift: ['unexpected.ts'] },
  ]) {
    assert.throws(
      () => generateSliceCheckpoint({ ...final, ...invalid }, verified),
      /final checkpoint|transition skips|precedes/u
    );
  }
});

test('rejects skipped, repeated, and backward delivery transitions', () => {
  const input = {
    schemaVersion: 1,
    stage: 'checkpoint',
    sliceId: 'HARNESS-V2-2',
    baseSha: sha('a'),
    headSha: sha('b'),
    treeSha: sha('c'),
    prNumber: null,
    mergeSha: null,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    heavyProofs: 0,
    duplicateHeavyProofs: 0,
    runnerMinutes: null,
    modelCostUsd: null,
    blockerPhase: 'none',
    scopeDrift: [],
  };
  assert.throws(() => generateSliceCheckpoint({ ...input, approvals: 2 }, verified), /repeated/u);
  assert.throws(() => generateSliceCheckpoint({ ...input, reFreezes: 1 }, verified), /precedes/u);
  assert.throws(() => generateSliceCheckpoint({ ...input, heavyProofs: 1 }, verified), /skips/u);
  assert.throws(() => generateSliceCheckpoint({ ...input, prNumber: 1700 }, verified), /skips/u);
});

test('rejects a checkpoint whose live state verifier cannot bind exact identity', () => {
  const input = {
    schemaVersion: 1,
    stage: 'checkpoint',
    sliceId: 'HARNESS-V2-1',
    baseSha: sha('a'),
    headSha: sha('b'),
    treeSha: sha('c'),
    prNumber: null,
    mergeSha: null,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    heavyProofs: 0,
    duplicateHeavyProofs: 0,
    runnerMinutes: null,
    modelCostUsd: null,
    blockerPhase: 'implementation',
    scopeDrift: [],
  };
  assert.throws(
    () => generateSliceCheckpoint(input, { verifyState: () => false }),
    /verified receipts/u
  );
  assert.throws(
    () =>
      generateSliceCheckpoint(input, {
        verifyState: value => ({
          verified: true,
          counters: {
            approvals: value.approvals + 1,
            reFreezes: value.reFreezes,
            retries: value.retries,
            heavyProofs: value.heavyProofs,
            duplicateHeavyProofs: value.duplicateHeavyProofs,
          },
        }),
      }),
    /verified receipts/u
  );
});
