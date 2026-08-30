import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeTelemetry } from './slice-telemetry.mjs';

function event(overrides = {}) {
  return {
    schemaVersion: 1,
    sliceId: 'T-OVERFLOW',
    phase: 'implementation',
    elapsedMs: 0,
    waitMs: 0,
    computeMs: 0,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    runnerMinutes: 0,
    modelCostUsd: 0,
    blockerPhase: 'none',
    evidenceKey: null,
    ...overrides,
  };
}

test('fails closed when integer metrics overflow within a slice', () => {
  const scenarios = [
    [
      event({
        phase: 'rehearsal',
        elapsedMs: Number.MAX_SAFE_INTEGER,
        waitMs: Number.MAX_SAFE_INTEGER,
      }),
      event({ phase: 'approval', elapsedMs: 1, waitMs: 1 }),
    ],
    [
      event({ phase: 'rehearsal', approvals: Number.MAX_SAFE_INTEGER }),
      event({ phase: 'approval', approvals: 1 }),
    ],
    [
      event({ phase: 'rehearsal', reFreezes: Number.MAX_SAFE_INTEGER }),
      event({ phase: 'approval', reFreezes: 1 }),
    ],
    [
      event({ phase: 'rehearsal', retries: Number.MAX_SAFE_INTEGER }),
      event({ phase: 'approval', retries: 1 }),
    ],
  ];
  for (const events of scenarios) {
    assert.throws(() => summarizeTelemetry(events), /overflow/u);
  }
});

test('fails closed when runner minutes or model cost becomes non-finite', () => {
  assert.throws(
    () =>
      summarizeTelemetry([
        event({ phase: 'implementation', runnerMinutes: 1e308 }),
        event({ phase: 'proof', runnerMinutes: 1e308 }),
      ]),
    /runner minutes aggregation overflowed/u
  );
  assert.throws(
    () =>
      summarizeTelemetry([
        event({ phase: 'implementation', modelCostUsd: 1e308 }),
        event({ phase: 'proof', modelCostUsd: 1e308 }),
      ]),
    /model cost aggregation overflowed/u
  );
});

test('fails closed when elapsed decomposition itself exceeds safe integer range', () => {
  assert.throws(
    () =>
      summarizeTelemetry([
        event({
          elapsedMs: Number.MAX_SAFE_INTEGER,
          waitMs: Number.MAX_SAFE_INTEGER,
          computeMs: 1,
        }),
      ]),
    /elapsed milliseconds aggregation overflowed/u
  );
});

test('separates external review latency and legitimate semantic reapproval from micro-approvals', () => {
  const summary = summarizeTelemetry([
    event({
      phase: 'approval',
      elapsedMs: 100,
      waitMs: 100,
      approvals: 1,
      blockerPhase: 'approval',
    }),
    event({
      phase: 'review',
      elapsedMs: 900,
      waitMs: 900,
      approvals: 1,
      blockerPhase: 'review',
    }),
  ]);
  assert.equal(summary.slices[0].operationalMicroApprovals, 0);
  assert.equal(summary.slices[0].governanceElapsedMs, 100);
  assert.equal(summary.slices[0].reviewElapsedMs, 900);
  assert.equal(summary.totals.reviewElapsedMs, 900);
  assert.equal(summary.governanceRatio, 0.1);
});

test('counts duplicate heavy proof and merge coordination in governance targets', () => {
  const key = 'a'.repeat(64);
  const summary = summarizeTelemetry([
    event({ phase: 'proof', evidenceKey: key }),
    event({ phase: 'proof', evidenceKey: key, elapsedMs: 1, computeMs: 1 }),
    event({ phase: 'merge', elapsedMs: 100, waitMs: 100, approvals: 1 }),
  ]);
  assert.deepEqual(summary.slices[0].evidenceKeys, [key, key]);
  assert.equal(summary.slices[0].duplicateHeavyProofs, 1);
  assert.equal(summary.totals.duplicateHeavyProofs, 1);
  assert.equal(summary.slices[0].governanceElapsedMs, 100);
  assert.equal(summary.targets.noDuplicateHeavyProof, false);
  assert.equal(summary.targets.allPassed, false);
});

test('counts the same heavy proof identity once across separate slices', () => {
  const key = 'b'.repeat(64);
  const summary = summarizeTelemetry([
    event({ sliceId: 'T-101', phase: 'proof', evidenceKey: key }),
    event({ sliceId: 'T-102', phase: 'proof', evidenceKey: key, approvals: 1 }),
  ]);
  assert.equal(summary.slices[0].duplicateHeavyProofs, 0);
  assert.equal(summary.slices[1].duplicateHeavyProofs, 0);
  assert.equal(summary.totals.duplicateHeavyProofs, 1);
  assert.equal(summary.targets.noDuplicateHeavyProof, false);
  assert.equal(summary.targets.allPassed, false);
});
