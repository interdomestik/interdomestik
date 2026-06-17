import { describe, expect, it } from 'vitest';

import { getRoutedResponsesWorkflowConfig } from './router-config';
import { routeAiModel } from './router';
import type { AiModelRoutingInput } from './types';

const safeClaimSummaryInput: AiModelRoutingInput = {
  workflow: 'claim_summary',
  mimeType: 'text/plain',
  parsedTextLength: 1_800,
  extractionTargetCount: 2,
  schemaVersion: 'claim_summary_v1',
  riskLevel: 'low',
  priorWarningCount: 0,
  priorConfidence: 0.88,
};

describe('routeAiModel default compatibility', () => {
  it('routes simple low-risk summarization to the standard profile', () => {
    expect(routeAiModel(safeClaimSummaryInput)).toEqual(
      expect.objectContaining({
        workflow: 'claim_summary',
        selectedProfile: 'standard',
        selectedModel: 'gpt-5-mini',
        fallbackReason: 'safe_standard_workload',
        escalated: false,
        routingInputCompleteness: 'complete',
      })
    );
  });

  it('fails closed to the existing default model for incomplete inputs', () => {
    expect(routeAiModel({ workflow: 'claim_summary' })).toEqual(
      expect.objectContaining({
        workflow: 'claim_summary',
        selectedProfile: 'default',
        selectedModel: 'gpt-5.5',
        fallbackReason: 'incomplete_input',
        routingInputCompleteness: 'partial',
      })
    );
  });

  it('fails closed to the existing default model for unknown workflows', () => {
    expect(routeAiModel({ workflow: 'unknown_extract' })).toEqual(
      expect.objectContaining({
        workflow: null,
        selectedModel: 'gpt-5.5',
        fallbackReason: 'unknown_workflow',
        routingInputCompleteness: 'partial',
      })
    );
  });

  it('builds routed Responses configs without changing legacy default compatibility', () => {
    const defaultConfig = getRoutedResponsesWorkflowConfig({
      ...safeClaimSummaryInput,
      riskLevel: 'normal',
      priorConfidence: 0.7,
    });

    expect(defaultConfig).toEqual(
      expect.objectContaining({
        workflow: 'claim_summary',
        model: 'gpt-5.5',
        promptVersion: 'claim_summary_v1',
        promptCacheKey: 'interdomestik:claim_summary:gpt-5.5:claim_summary_v1',
        route: expect.objectContaining({
          selectedModel: 'gpt-5.5',
          fallbackReason: 'default_compatibility',
        }),
      })
    );
  });
});
