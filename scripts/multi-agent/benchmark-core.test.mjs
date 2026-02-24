import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBenchmarkScorecard, computeRoleMetrics } from './benchmark-core.mjs';

test('computes success, latency, and quality-per-dollar per role', () => {
  const metrics = computeRoleMetrics([
    {
      role: 'gatekeeper',
      success: true,
      latencyMs: 1000,
      tokenCount: 1000,
      costUsd: 0.02,
    },
    {
      role: 'gatekeeper',
      success: false,
      latencyMs: 3000,
      tokenCount: 1200,
      costUsd: 0.03,
    },
    {
      role: 'preflight-agent',
      success: true,
      latencyMs: 700,
      tokenCount: 600,
      costUsd: 0.01,
    },
  ]);

  assert.equal(metrics.gatekeeper.totalRuns, 2);
  assert.equal(metrics.gatekeeper.successfulRuns, 1);
  assert.equal(metrics.gatekeeper.successRate, 0.5);
  assert.equal(metrics.gatekeeper.avgLatencyMs, 2000);
  assert.equal(metrics.gatekeeper.p95LatencyMs, 3000);
  assert.equal(metrics.gatekeeper.totalTokens, 2200);
  assert.equal(metrics.gatekeeper.totalCostUsd, 0.05);
  assert.equal(metrics.gatekeeper.qualityPerDollar, 20);

  assert.equal(metrics['preflight-agent'].successRate, 1);
  assert.equal(metrics['preflight-agent'].qualityPerDollar, 100);
});

test('buildBenchmarkScorecard aggregates suite totals and role metrics', () => {
  const scorecard = buildBenchmarkScorecard({
    suiteName: 'internal-suite',
    startedAt: '2026-02-24T00:00:00.000Z',
    endedAt: '2026-02-24T00:05:00.000Z',
    executions: [
      {
        role: 'gatekeeper',
        success: true,
        latencyMs: 1000,
        tokenCount: 1000,
        costUsd: 0.02,
      },
      {
        role: 'gatekeeper',
        success: false,
        latencyMs: 2000,
        tokenCount: 500,
        costUsd: 0.01,
      },
    ],
  });

  assert.equal(scorecard.suiteName, 'internal-suite');
  assert.equal(scorecard.totalRuns, 2);
  assert.equal(scorecard.successfulRuns, 1);
  assert.equal(scorecard.failedRuns, 1);
  assert.equal(scorecard.successRate, 0.5);
  assert.equal(scorecard.totalCostUsd, 0.03);
  assert.equal(scorecard.roleMetrics.gatekeeper.totalRuns, 2);
  assert.equal(scorecard.roleMetrics.gatekeeper.totalCostUsd, 0.03);
});
