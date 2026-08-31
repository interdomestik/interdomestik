import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { generateSliceCheckpoint, verifyCheckpointGitIdentity } from './slice-rehearse-report.mjs';

const sha = character => character.repeat(40);
const verified = { verifyState: () => true };

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

test('generates one closed checkpoint/final report with exactly one legal next action', () => {
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
      legalNextActions: ['approve bounded delivery envelope for exact head'],
    },
    verified
  );
  assert.equal(report.legalNextAction, 'approve bounded delivery envelope for exact head');
  assert.equal(report.runnerMinutes, null);
  assert.equal(report.modelCostUsd, null);
  assert.equal(Object.hasOwn(report, 'legalNextActions'), false);
});

test('rejects ambiguous next actions, duplicate proof, and invalid exact state', () => {
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
    legalNextActions: ['continue implementation'],
  };
  assert.throws(
    () => generateSliceCheckpoint({ ...base, legalNextActions: [] }, verified),
    /one legal next action/u
  );
  assert.throws(
    () => generateSliceCheckpoint({ ...base, legalNextActions: ['a', 'b'] }, verified),
    /one legal next action/u
  );
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
    legalNextActions: ['none'],
  };
  assert.equal(generateSliceCheckpoint(final, verified).stage, 'final');
  for (const invalid of [
    { mergeSha: null },
    { prNumber: null },
    { approvals: 0 },
    { heavyProofs: 0 },
    { blockerPhase: 'review' },
    { scopeDrift: ['unexpected.ts'] },
    { legalNextActions: ['continue'] },
  ]) {
    assert.throws(
      () => generateSliceCheckpoint({ ...final, ...invalid }, verified),
      /final checkpoint/u
    );
  }
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
    legalNextActions: ['continue implementation'],
  };
  assert.throws(
    () => generateSliceCheckpoint(input, { verifyState: () => false }),
    /verified repository facts/u
  );
});
