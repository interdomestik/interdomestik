import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePromotionDecision, validateConformanceRecord } from './gate.mjs';

const TEST_CHARTER_MAP = {
  sprint_scope: ['A1', 'A2', 'B1', 'F1.0'],
  advisory_only_epics: ['A2', 'B1'],
  step_catalog: {
    A1: {
      allowed_file_patterns: ['scripts/plan-conformance/**', 'docs/plans/**', 'package.json'],
      steps: { 'A1.1': 'define schema' },
    },
    A2: {
      allowed_file_patterns: ['scripts/plan-conformance/**', 'docs/plans/**', 'package.json'],
      steps: { 'A2.1': 'advisory retrieval' },
    },
    B1: {
      allowed_file_patterns: ['scripts/plan-conformance/**', 'docs/plans/**', 'package.json'],
      steps: { 'B1.1': 'boundary report' },
    },
    'F1.0': {
      allowed_file_patterns: ['docs/plans/**'],
      steps: { 'F1.0.1': 'baseline' },
    },
  },
};

const NO_TOUCH_ZONES = ['apps/web/src/proxy.ts', 'packages/database/**'];

function makeBaseRecord(overrides = {}) {
  return {
    step_id: 'A1.1',
    epic_id: 'A1',
    mode: 'advisory',
    files_changed: ['scripts/plan-conformance/gate.mjs'],
    checks: [{ name: 'pnpm security:guard', status: 'pass', required: true }],
    result: 'pass',
    variance: false,
    decision: 'continue',
    owner: 'platform',
    timestamp: '2026-03-03T12:00:00.000Z',
    ...overrides,
  };
}

test('conformance parser rejects a step with unmapped scope', () => {
  const result = validateConformanceRecord(
    makeBaseRecord({ step_id: 'A1.999' }),
    {
      charterMap: TEST_CHARTER_MAP,
      noTouchZones: NO_TOUCH_ZONES,
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('not mapped')));
});

test('conformance gate fails when a no-touch file is modified', () => {
  const result = validateConformanceRecord(
    makeBaseRecord({ files_changed: ['apps/web/src/proxy.ts'] }),
    {
      charterMap: TEST_CHARTER_MAP,
      noTouchZones: NO_TOUCH_ZONES,
    }
  );

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes('no-touch violation')));
});

test('advisory mode remains non-blocking when only advisory checks fail', () => {
  const result = validateConformanceRecord(
    makeBaseRecord({
      step_id: 'A2.1',
      epic_id: 'A2',
      mode: 'advisory',
      checks: [
        { name: 'pnpm security:guard', status: 'pass', required: true },
        { name: 'memory advisory lane', status: 'fail', required: false },
      ],
      result: 'pass',
    }),
    {
      charterMap: TEST_CHARTER_MAP,
      noTouchZones: NO_TOUCH_ZONES,
    }
  );

  assert.equal(result.ok, true);
  assert.ok(result.warnings.some(message => message.includes('advisory checks')));
});

test('promotion gate denies enforce mode when thresholds are unmet', () => {
  const decision = evaluatePromotionDecision({
    window: '2026-W10',
    thresholds: {
      phase_c_control_regressions: 0,
      unrelated_pr_noise_pct: 12,
      retrieval_usefulness_pct: 68,
      gate_runtime_increase_pct: 16,
      boundary_report_stable: false,
      tenant_boundary_regressions: 0,
      consecutive_weeks: 1,
    },
    pass_fail: false,
    approvers: ['platform', 'qa'],
    effective_mode: 'advisory',
  });

  assert.equal(decision.pass_fail, false);
  assert.equal(decision.effective_mode, 'advisory');
  assert.ok(decision.unmet_thresholds.length >= 1);
});
