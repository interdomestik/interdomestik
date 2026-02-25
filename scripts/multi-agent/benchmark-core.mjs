function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const boundedRank = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[boundedRank];
}

export function computeRoleMetrics(executions) {
  const grouped = new Map();
  for (const execution of executions || []) {
    const role = String(execution.role || 'unknown');
    const existing = grouped.get(role) || [];
    existing.push({
      success: Boolean(execution.success),
      latencyMs: Math.max(0, Math.round(asNumber(execution.latencyMs, 0))),
      tokenCount: Math.max(0, Math.round(asNumber(execution.tokenCount, 0))),
      costUsd: Math.max(0, asNumber(execution.costUsd, 0)),
    });
    grouped.set(role, existing);
  }

  const result = {};
  for (const [role, records] of grouped.entries()) {
    const totalRuns = records.length;
    const successfulRuns = records.filter(record => record.success).length;
    const latencies = records.map(record => record.latencyMs);
    const totalLatencyMs = latencies.reduce((sum, value) => sum + value, 0);
    const totalTokens = records.reduce((sum, record) => sum + record.tokenCount, 0);
    const totalCostUsd = round(records.reduce((sum, record) => sum + record.costUsd, 0), 6);
    const successRate = totalRuns === 0 ? 0 : round(successfulRuns / totalRuns, 6);
    const qualityPerDollar =
      totalCostUsd <= 0 ? successfulRuns : round(successfulRuns / totalCostUsd, 6);

    result[role] = {
      totalRuns,
      successfulRuns,
      failedRuns: totalRuns - successfulRuns,
      successRate,
      avgLatencyMs: totalRuns === 0 ? 0 : Math.round(totalLatencyMs / totalRuns),
      p95LatencyMs: percentile(latencies, 95),
      totalTokens,
      totalCostUsd,
      qualityPerDollar,
    };
  }

  return result;
}

export function buildBenchmarkScorecard(input) {
  const startedAt = input.startedAt || new Date().toISOString();
  const endedAt = input.endedAt || new Date().toISOString();
  const executions = Array.isArray(input.executions) ? input.executions : [];
  const roleMetrics = computeRoleMetrics(executions);
  const totalRuns = executions.length;
  const successfulRuns = executions.filter(execution => execution.success).length;
  const failedRuns = totalRuns - successfulRuns;
  const totalCostUsd = round(executions.reduce((sum, row) => sum + asNumber(row.costUsd, 0), 0), 6);

  return {
    suiteName: input.suiteName || 'multi-agent-internal-suite',
    startedAt,
    endedAt,
    totalRuns,
    successfulRuns,
    failedRuns,
    successRate: totalRuns === 0 ? 0 : round(successfulRuns / totalRuns, 6),
    totalCostUsd,
    roleMetrics,
  };
}

