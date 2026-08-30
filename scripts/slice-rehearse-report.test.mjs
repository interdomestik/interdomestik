import assert from 'node:assert/strict';
import test from 'node:test';

import { generateSliceCheckpoint } from './slice-rehearse-report.mjs';

const sha = character => character.repeat(40);

test('generates one closed checkpoint/final report with exactly one legal next action', () => {
  const report = generateSliceCheckpoint({
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
  });
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
    () => generateSliceCheckpoint({ ...base, legalNextActions: [] }),
    /one legal next action/u
  );
  assert.throws(
    () => generateSliceCheckpoint({ ...base, legalNextActions: ['a', 'b'] }),
    /one legal next action/u
  );
  assert.throws(
    () => generateSliceCheckpoint({ ...base, duplicateHeavyProofs: 1 }),
    /duplicate heavy proof/u
  );
  assert.throws(() => generateSliceCheckpoint({ ...base, treeSha: null }), /tree SHA/u);
});
