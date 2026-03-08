import { describe, expect, it } from 'vitest';

import { aggregateAiTelemetry, createAiTelemetryEvent } from './telemetry';

describe('createAiTelemetryEvent', () => {
  it('normalizes raw run metadata into a stable telemetry event', () => {
    expect(
      createAiTelemetryEvent({
        workflow: 'policy_extract',
        tenantId: ' tenant-1 ',
        promptVersion: ' policy_extract_v1 ',
        model: 'gpt-5.4',
        latencyMs: 1820.6,
        inputTokens: 1200.8,
        outputTokens: 233.2,
        cachedInputTokens: 5_000,
        status: ' completed ',
        reviewStatus: ' approved ',
        costUsd: 0.018734,
      })
    ).toEqual({
      workflow: 'policy_extract',
      tenantId: 'tenant-1',
      promptVersion: 'policy_extract_v1',
      model: 'gpt-5.4',
      latencyMs: 1821,
      inputTokens: 1201,
      outputTokens: 233,
      cachedInputTokens: 1201,
      status: 'completed',
      reviewStatus: 'approved',
      costUsd: 0.018734,
    });
  });
});

describe('aggregateAiTelemetry', () => {
  it('computes workflow and overall rollout metrics', () => {
    const aggregate = aggregateAiTelemetry([
      createAiTelemetryEvent({
        workflow: 'policy_extract',
        tenantId: 'tenant-1',
        promptVersion: 'policy_extract_v1',
        model: 'gpt-5.4',
        latencyMs: 1200,
        inputTokens: 1000,
        outputTokens: 180,
        cachedInputTokens: 250,
        status: 'completed',
        reviewStatus: 'approved',
        costUsd: 0.021,
      }),
      createAiTelemetryEvent({
        workflow: 'policy_extract',
        tenantId: 'tenant-1',
        promptVersion: 'policy_extract_v1',
        model: 'gpt-5.4',
        latencyMs: 800,
        inputTokens: 500,
        outputTokens: 110,
        cachedInputTokens: 50,
        status: 'completed',
        reviewStatus: 'corrected',
        costUsd: 0.011,
      }),
      createAiTelemetryEvent({
        workflow: 'legal_doc_extract',
        tenantId: 'tenant-2',
        promptVersion: 'legal_doc_extract_v1',
        model: 'gpt-5.4',
        latencyMs: 2000,
        inputTokens: 900,
        outputTokens: 210,
        cachedInputTokens: 300,
        status: 'completed',
        reviewStatus: 'approved',
        costUsd: 0.016,
      }),
    ]);

    expect(aggregate).toEqual({
      totalRuns: 3,
      averageLatencyMs: 1333.3333,
      averageCostUsd: 0.016,
      cachedInputTokenRate: 0.25,
      humanAcceptanceRate: 0.6667,
      byWorkflow: {
        legal_doc_extract: {
          runs: 1,
          averageLatencyMs: 2000,
          averageCostUsd: 0.016,
          cachedInputTokenRate: 0.3333,
          humanAcceptanceRate: 1,
        },
        policy_extract: {
          runs: 2,
          averageLatencyMs: 1000,
          averageCostUsd: 0.016,
          cachedInputTokenRate: 0.2,
          humanAcceptanceRate: 0.5,
        },
      },
    });
  });

  it('returns zeroed metrics for an empty telemetry set', () => {
    expect(aggregateAiTelemetry([])).toEqual({
      totalRuns: 0,
      averageLatencyMs: 0,
      averageCostUsd: 0,
      cachedInputTokenRate: 0,
      humanAcceptanceRate: 0,
      byWorkflow: {},
    });
  });
});
