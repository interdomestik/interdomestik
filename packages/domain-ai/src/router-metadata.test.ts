import { describe, expect, it } from 'vitest';

import { getRoutedResponsesWorkflowConfig } from './router-config';
import { routeAiModel } from './router';
import { createAiTelemetryEvent } from './telemetry';

describe('AI route metadata', () => {
  it('records telemetry-ready resource routing metadata', () => {
    const route = routeAiModel({
      workflow: 'claim_intake_extract',
      mimeType: 'text/plain',
      parsedTextLength: 2_200,
      extractionTargetCount: 4,
      schemaVersion: 'claim_intake_extract_v1',
      claimCategory: 'travel',
      riskLevel: 'low',
      priorWarningCount: 1,
      priorConfidence: 0.84,
      confidenceAfterCritique: 0.86,
    });

    expect(route).toEqual(
      expect.objectContaining({
        selectedProfile: 'standard',
        selectedModel: 'gpt-5-mini',
        fallbackReason: 'safe_standard_workload',
        confidenceBeforeCritique: 0.84,
        confidenceAfterCritique: 0.86,
        riskLevel: 'low',
        routingInputCompleteness: 'complete',
      })
    );
  });

  it('carries router metadata through telemetry normalization when provided', () => {
    const route = routeAiModel({
      workflow: 'claim_summary',
      mimeType: 'text/plain',
      parsedTextLength: 1_500,
      extractionTargetCount: 1,
      schemaVersion: 'claim_summary_v1',
      riskLevel: 'low',
      priorConfidence: 0.9,
    });

    expect(
      createAiTelemetryEvent({
        workflow: 'claim_summary',
        tenantId: 'tenant-1',
        promptVersion: 'claim_summary_v1',
        model: route.selectedModel,
        route,
      })
    ).toEqual(
      expect.objectContaining({
        workflow: 'claim_summary',
        model: 'gpt-5-mini',
        route,
      })
    );
  });

  it('uses cheap models only for low-risk control-plane routing', () => {
    const config = getRoutedResponsesWorkflowConfig({
      workflow: 'claim_summary',
      mimeType: 'text/plain',
      parsedTextLength: 1_000,
      extractionTargetCount: 1,
      schemaVersion: 'claim_summary_v1',
      riskLevel: 'low',
      controlPlaneOnly: true,
    });

    expect(config).toEqual(
      expect.objectContaining({
        model: 'gpt-5-nano',
        maxOutputTokens: 512,
        route: expect.objectContaining({
          selectedProfile: 'cheap',
          fallbackReason: 'control_plane_only',
        }),
      })
    );
  });
});
