import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveEvidenceKey, evaluateEvidenceReceipts } from './slice-rehearse-evidence.mjs';
import {
  evidenceAfterPlannedOperations,
  requiredEvidenceProofDeficit,
} from './slice-rehearse-evaluator.mjs';

const sha = character => character.repeat(40);
const digest = character => character.repeat(64);

function receipt(lane, overrides = {}) {
  return {
    lane,
    headSha: sha('a'),
    treeSha: sha('b'),
    commandDigest: digest('c'),
    workflowDigest: digest('d'),
    substrateDigest: digest('e'),
    writerMapDigest: digest('f'),
    status: 'success',
    expiresAt: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const expected = {
  headSha: sha('a'),
  treeSha: sha('b'),
  commandDigest: digest('c'),
  workflowDigest: digest('d'),
  substrateDigest: digest('e'),
  writerMapDigest: digest('f'),
};
const expectedByLane = {
  pilot: { ...expected, commandDigest: digest('1') },
  runner: expected,
};

test('evidence identity binds the exact heavy lane', () => {
  assert.notEqual(deriveEvidenceKey(receipt('runner')), deriveEvidenceKey(receipt('pilot')));
  assert.throws(() => deriveEvidenceKey(receipt('../runner')), /lane/u);
});

test('manifest evidence is advisory and duplicates cannot fill a heavy lane', () => {
  const result = evaluateEvidenceReceipts({
    receipts: [receipt('runner'), receipt('runner')],
    heavyLanes: ['pilot', 'runner'],
    expectedByLane,
    dirtyWriterPaths: [],
  });

  assert.deepEqual(result.reusableLanes, []);
  assert.deepEqual(
    result.decisions.map(decision => [decision.lane, decision.reusable, decision.reason]),
    [
      ['runner', false, 'manifest_receipt_untrusted'],
      ['runner', false, 'duplicate_lane'],
    ]
  );
  assert.deepEqual(result.missingLanes, ['pilot', 'runner']);
});

test('wrong-lane or dirty-writer evidence is never reusable', () => {
  const wrongLane = evaluateEvidenceReceipts({
    receipts: [receipt('smoke')],
    heavyLanes: ['runner'],
    expectedByLane,
    dirtyWriterPaths: [],
  });
  assert.deepEqual(wrongLane.reusableLanes, []);
  assert.equal(wrongLane.decisions[0].reason, 'lane_not_required');

  const dirty = evaluateEvidenceReceipts({
    receipts: [receipt('runner')],
    heavyLanes: ['runner'],
    expectedByLane,
    dirtyWriterPaths: ['scripts/slice-rehearse.mjs'],
  });
  assert.deepEqual(dirty.reusableLanes, []);
  assert.equal(dirty.decisions[0].reason, 'dirty_writer');
  assert.deepEqual(dirty.missingLanes, ['runner']);
});

test('a receipt cannot cross lanes with another lane command identity', () => {
  const result = evaluateEvidenceReceipts({
    receipts: [receipt('pilot')],
    heavyLanes: ['pilot'],
    expectedByLane,
    dirtyWriterPaths: [],
  });
  assert.deepEqual(result.reusableLanes, []);
  assert.equal(result.decisions[0].reason, 'identity_mismatch');
});

test('a forged future-dated success receipt cannot suppress heavy proof', () => {
  const result = evaluateEvidenceReceipts({
    receipts: [receipt('runner', { expiresAt: '2999-01-01T00:00:00.000Z' })],
    heavyLanes: ['runner'],
    expectedByLane,
    dirtyWriterPaths: [],
  });
  assert.deepEqual(result.reusableLanes, []);
  assert.deepEqual(result.missingLanes, ['runner']);
  assert.equal(result.decisions[0].reason, 'manifest_receipt_untrusted');
});

test('only an exact independently verified pr-e2e key is reusable', () => {
  const candidate = receipt('pr-e2e', { expiresAt: '2099-01-02T00:00:00.000Z' });
  const key = deriveEvidenceKey(candidate);
  const verifiedRecord = {
    provider: 'github',
    key,
    checkId: 41,
    runId: 42,
    completedAt: '2099-01-01T00:00:00.000Z',
  };
  const verified = evaluateEvidenceReceipts({
    receipts: [candidate],
    heavyLanes: ['pr-e2e'],
    expectedByLane: { 'pr-e2e': expected },
    verifiedEvidenceKeysByLane: { 'pr-e2e': [verifiedRecord] },
    dirtyWriterPaths: [],
    now: Date.parse('2099-01-01T01:00:00.000Z'),
  });
  assert.deepEqual(verified.reusableLanes, ['pr-e2e']);
  assert.deepEqual(verified.missingLanes, []);
  assert.equal(verified.decisions[0].reason, 'independently_verified');

  for (const verifiedEvidenceKeysByLane of [
    { 'pr-e2e': [{ ...verifiedRecord, key: digest('0') }] },
    { pilot: [verifiedRecord] },
  ]) {
    const rejected = evaluateEvidenceReceipts({
      receipts: [candidate],
      heavyLanes: ['pr-e2e'],
      expectedByLane: { 'pr-e2e': expected },
      verifiedEvidenceKeysByLane,
      dirtyWriterPaths: [],
      now: Date.parse('2099-01-01T01:00:00.000Z'),
    });
    assert.deepEqual(rejected.reusableLanes, []);
    assert.deepEqual(rejected.missingLanes, ['pr-e2e']);
  }
});

test('verified evidence freshness is independent of forged manifest expiry', () => {
  const candidate = { ...receipt('pr-e2e'), expiresAt: '2999-01-01T00:00:00.000Z' };
  const key = deriveEvidenceKey(candidate);
  const result = evaluateEvidenceReceipts({
    receipts: [candidate],
    heavyLanes: ['pr-e2e'],
    expectedByLane: { 'pr-e2e': expected },
    verifiedEvidenceKeysByLane: {
      'pr-e2e': [
        {
          provider: 'github',
          key,
          checkId: 41,
          runId: 42,
          completedAt: '2098-12-01T00:00:00.000Z',
        },
      ],
    },
    dirtyWriterPaths: [],
    now: Date.parse('2099-01-01T01:00:00.000Z'),
  });
  assert.deepEqual(result.reusableLanes, []);
  assert.deepEqual(result.missingLanes, ['pr-e2e']);
});

test('malformed receipt fails closed while expired evidence is a non-reusable decision', () => {
  const malformed = receipt('runner');
  malformed.unexpected = true;
  const malformedResult = evaluateEvidenceReceipts({
    receipts: [malformed],
    heavyLanes: ['runner'],
    expectedByLane,
    dirtyWriterPaths: [],
  });
  assert.equal(malformedResult.decisions[0].reason, 'evidence receipt keys are invalid');
  assert.equal(malformedResult.decisions[0].reusable, false);
  assert.deepEqual(malformedResult.missingLanes, ['runner']);

  const expired = evaluateEvidenceReceipts({
    receipts: [receipt('runner', { expiresAt: '2000-01-01T00:00:00.000Z' })],
    heavyLanes: ['runner'],
    expectedByLane,
    dirtyWriterPaths: [],
  });
  assert.equal(expired.decisions[0].reason, 'evidence receipt is expired');
  assert.deepEqual(expired.missingLanes, ['runner']);
});

test('identity-changing operations retain current reuse as informational evidence only', () => {
  const current = {
    decisions: [{ lane: 'pr-e2e', reusable: true }],
    reusableLanes: ['pr-e2e'],
    missingLanes: [],
  };
  const final = evidenceAfterPlannedOperations(current, [
    { code: 'capacity:new-files', coveredBy: 'derived_capacity_rebind' },
  ]);
  assert.deepEqual(final.reusableLanes, ['pr-e2e']);
  assert.deepEqual(final.missingLanes, ['pr-e2e']);
  assert.deepEqual(requiredEvidenceProofDeficit(final), {
    code: 'evidence:heavy-proof-required',
    lanes: ['pr-e2e'],
    coveredBy: 'rerun_invalidated_proof',
  });

  const explicitlyPlanned = evidenceAfterPlannedOperations(
    current,
    [],
    ['fresh_worktree_patch_replay']
  );
  assert.deepEqual(explicitlyPlanned.missingLanes, ['pr-e2e']);
});

test('identity-preserving full-gate admission does not invalidate exact-head proof', () => {
  const current = {
    decisions: [{ lane: 'pr-e2e', reusable: true }],
    reusableLanes: ['pr-e2e'],
    missingLanes: [],
  };
  const final = evidenceAfterPlannedOperations(current, [
    { code: 'proof:full-gate', coveredBy: 'apply_full_gate_label' },
  ]);
  assert.deepEqual(final.missingLanes, []);
  assert.equal(requiredEvidenceProofDeficit(final), null);
});
