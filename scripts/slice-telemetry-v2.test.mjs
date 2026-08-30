import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeTelemetryV2, validateTelemetryEventV2 } from './slice-telemetry-v2.mjs';

function event(overrides = {}) {
  return {
    schemaVersion: 2,
    sliceId: 'HARNESS-V2-1',
    phase: 'implementation',
    approvalClass: 'none',
    elapsedMs: 100,
    waitMs: 20,
    computeMs: 80,
    approvals: 0,
    reFreezes: 0,
    retries: 0,
    runnerMinutes: null,
    modelCostUsd: null,
    blockerPhase: 'none',
    evidenceKey: null,
    ...overrides,
  };
}

test('preserves genuinely unknown timing, runner, and model values as null', () => {
  const unknown = validateTelemetryEventV2(
    event({ elapsedMs: null, waitMs: null, computeMs: null })
  );
  const summary = summarizeTelemetryV2([unknown]);
  assert.equal(summary.totals.elapsedMs, null);
  assert.equal(summary.totals.runnerMinutes, null);
  assert.equal(summary.totals.modelCostUsd, null);
  assert.equal(summary.governanceRatio, null);
});

test('separates design, implementation, merge, deterministic closeout, and global hygiene', () => {
  const events = [
    event({
      phase: 'design',
      approvals: 1,
      approvalClass: 'delivery',
      elapsedMs: 20,
      waitMs: 20,
      computeMs: 0,
    }),
    event({ phase: 'implementation', elapsedMs: 180, waitMs: 0, computeMs: 180, retries: 2 }),
    event({ phase: 'merge', elapsedMs: 20, waitMs: 20, computeMs: 0 }),
    event({ phase: 'deterministic_closeout', elapsedMs: 20, waitMs: 0, computeMs: 20 }),
    event({
      phase: 'global_hygiene',
      approvals: 1,
      approvalClass: 'global_hygiene',
      elapsedMs: 10,
      waitMs: 10,
      computeMs: 0,
    }),
  ];
  const summary = summarizeTelemetryV2(events);
  assert.equal(summary.slices[0].deliveryApprovals, 1);
  assert.equal(summary.slices[0].globalHygieneApprovals, 1);
  assert.equal(summary.slices[0].operationalMicroApprovals, 0);
  assert.equal(summary.governanceRatio, 0.24);
  assert.equal(summary.targets.allPassed, true);
});

test('enforces approval classification and happy-path retry/heavy-proof targets', () => {
  assert.throws(() => validateTelemetryEventV2(event({ approvals: 1 })), /approval class/u);
  assert.throws(
    () => validateTelemetryEventV2(event({ approvalClass: 'operational' })),
    /approval class/u
  );
  const key = 'a'.repeat(64);
  const summary = summarizeTelemetryV2([
    event({ phase: 'design', approvals: 1, approvalClass: 'delivery' }),
    event({ phase: 'proof', evidenceKey: key, elapsedMs: 0, waitMs: 0, computeMs: 0 }),
    event({ phase: 'proof', evidenceKey: key, elapsedMs: 1, waitMs: 0, computeMs: 1, retries: 6 }),
  ]);
  assert.equal(summary.targets.noDuplicateHeavyProof, false);
  assert.equal(summary.targets.atMostFiveToolingRetries, false);
  assert.equal(summary.targets.allPassed, false);
});
