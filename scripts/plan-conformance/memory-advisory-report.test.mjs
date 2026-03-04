import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAdvisorySignalReport } from './memory-advisory-report.mjs';

test('builds advisory signal report with retrieval hits and defaults', () => {
  const report = buildAdvisorySignalReport({
    retrievalPayload: {
      hits: [{ id: 'mem_1' }, { id: 'mem_2' }, { id: 'mem_1' }],
    },
    runId: 'run_test_001',
  });

  assert.equal(report.run_id, 'run_test_001');
  assert.deepEqual(report.retrieval_hits, ['mem_1', 'mem_2']);
  assert.deepEqual(report.noise_flags, []);
  assert.deepEqual(report.boundary_findings, []);
  assert.equal(report.usefulness_score, 0);
  assert.equal(report.retrieval_count, 2);
});

test('applies context and clamps usefulness score', () => {
  const report = buildAdvisorySignalReport({
    retrievalPayload: {
      hits: [{ id: 'mem_1' }],
    },
    context: {
      noise_flags: ['none', 'none', 'low-noise'],
      boundary_findings: ['protected_path_changed'],
      usefulness_score: 143.55,
    },
    runId: 'run_test_002',
  });

  assert.equal(report.run_id, 'run_test_002');
  assert.deepEqual(report.noise_flags, ['none', 'low-noise']);
  assert.deepEqual(report.boundary_findings, ['protected_path_changed']);
  assert.equal(report.usefulness_score, 100);
});

test('rejects invalid retrieval payloads', () => {
  assert.throws(
    () =>
      buildAdvisorySignalReport({
        retrievalPayload: { not_hits: [] },
        runId: 'run_invalid',
      }),
    /retrieval payload must include hits\[\]/
  );
});
