import assert from 'node:assert/strict';
import test from 'node:test';

import { computeRoleMetrics } from './benchmark-core.mjs';

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

