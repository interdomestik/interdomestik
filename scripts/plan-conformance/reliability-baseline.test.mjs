import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReliabilityBaseline } from './reliability-baseline.mjs';

const SAMPLE_ENTRIES = [
  {
    checks: [
      { name: 'pnpm security:guard', status: 'pass', required: true },
      { name: 'pnpm boundary:diff:report', status: 'warn', required: false },
    ],
  },
  {
    checks: [
      { name: 'pnpm security:guard', status: 'fail', required: true },
      { name: 'pnpm security:guard', status: 'pass', required: true },
    ],
  },
];

test('computes pass/fail baseline with runtime evidence fallback', () => {
  const report = buildReliabilityBaseline(SAMPLE_ENTRIES, 'pass_fail');

  assert.equal(report.focus, 'pass_fail');
  assert.equal(report.pass_fail.required_total, 3);
  assert.equal(report.pass_fail.required_pass, 2);
  assert.equal(report.pass_fail.required_fail, 1);
  assert.equal(report.runtime.evidence, 'Not Present in Current Repo Evidence');
});

test('detects flaky checks when fail and pass both appear', () => {
  const report = buildReliabilityBaseline(SAMPLE_ENTRIES, 'flake');

  assert.equal(report.flaky.flaky_check_count, 1);
  assert.deepEqual(report.flaky.flaky_checks, ['pnpm security:guard']);
});

test('computes unrelated failure rate from non-required fail/warn checks', () => {
  const report = buildReliabilityBaseline(SAMPLE_ENTRIES, 'unrelated');

  assert.equal(report.unrelated.total_fail_or_warn, 2);
  assert.equal(report.unrelated.unrelated_fail_or_warn, 1);
  assert.equal(report.unrelated.unrelated_failure_rate_pct, 50);
});

test('treats unknown and special statuses as unknown bucket entries', () => {
  const report = buildReliabilityBaseline(
    [
      {
        checks: [{ name: 'pnpm security:guard', status: '__proto__', required: true }],
      },
    ],
    'pass_fail'
  );

  assert.equal(report.pass_fail.check_summary['pnpm security:guard'].unknown, 1);
});
