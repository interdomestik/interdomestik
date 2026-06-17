import { describe, expect, it } from 'vitest';

import { routeAiModel } from './router';
import type { AiModelRoutingInput } from './types';

const completeLegalInput: AiModelRoutingInput = {
  workflow: 'legal_doc_extract',
  mimeType: 'application/pdf',
  parsedTextLength: 3_500,
  extractionTargetCount: 8,
  schemaVersion: 'legal_doc_extract_v1',
  legalDocumentType: 'court_filing',
  jurisdictionConfidence: 0.9,
  riskLevel: 'high',
  priorWarningCount: 1,
  priorConfidence: 0.73,
};

describe('routeAiModel escalation controls', () => {
  it('keeps high-risk inputs on the default model unless escalation is approved', () => {
    expect(routeAiModel(completeLegalInput)).toEqual(
      expect.objectContaining({
        selectedProfile: 'default',
        selectedModel: 'gpt-5.5',
        fallbackReason: 'high_risk',
        escalated: false,
      })
    );
  });

  it('uses escalation model only for approved high-risk escalation', () => {
    expect(routeAiModel({ ...completeLegalInput, approvedEscalation: true })).toEqual(
      expect.objectContaining({
        selectedProfile: 'escalation',
        selectedModel: 'gpt-5.4-pro',
        fallbackReason: 'high_risk',
        escalated: true,
      })
    );
  });

  it('escalates low-confidence inputs only with explicit approval', () => {
    const route = routeAiModel({
      ...completeLegalInput,
      legalDocumentType: 'other',
      riskLevel: 'normal',
      priorConfidence: 0.48,
      approvedEscalation: true,
    });

    expect(route).toEqual(
      expect.objectContaining({
        selectedModel: 'gpt-5.4-pro',
        fallbackReason: 'low_confidence',
        escalated: true,
      })
    );
  });

  it('keeps sparse document inputs on the default model without premium routing', () => {
    expect(
      routeAiModel({
        ...completeLegalInput,
        legalDocumentType: 'other',
        riskLevel: 'normal',
        parsedTextLength: 120,
        priorConfidence: 0.8,
      })
    ).toEqual(
      expect.objectContaining({
        selectedModel: 'gpt-5.5',
        fallbackReason: 'sparse_document',
        escalated: false,
      })
    );
  });

  it('does not use cheap control-plane routing for sparse or low-confidence inputs', () => {
    const controlPlaneInput: AiModelRoutingInput = {
      workflow: 'claim_summary',
      mimeType: 'text/plain',
      parsedTextLength: 1_200,
      extractionTargetCount: 1,
      schemaVersion: 'claim_summary_v1',
      riskLevel: 'low',
      priorWarningCount: 0,
      priorConfidence: 0.9,
      controlPlaneOnly: true,
    };

    expect(routeAiModel({ ...controlPlaneInput, parsedTextLength: 120 })).toEqual(
      expect.objectContaining({
        selectedProfile: 'default',
        selectedModel: 'gpt-5.5',
        fallbackReason: 'sparse_document',
      })
    );

    expect(routeAiModel({ ...controlPlaneInput, priorConfidence: 0.4 })).toEqual(
      expect.objectContaining({
        selectedProfile: 'default',
        selectedModel: 'gpt-5.5',
        fallbackReason: 'low_confidence',
      })
    );
  });
});
