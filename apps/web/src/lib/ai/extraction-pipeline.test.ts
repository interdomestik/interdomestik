import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ExtractionPipelineError,
  critiqueExtraction,
  validateExtractionCandidate,
} from './extraction-pipeline';

describe('critiqueExtraction', () => {
  it('allows low-confidence extraction as pending human review', () => {
    expect(
      critiqueExtraction({
        confidence: 0.62,
        warnings: ['Confirm extracted amount.'],
        metrics: { byteLength: 128, textLength: 96, hasText: true },
      })
    ).toEqual(
      expect.objectContaining({
        decision: 'needs_human_review',
        persistenceAllowed: true,
        warningCodes: expect.arrayContaining(['low_confidence', 'extraction_warnings']),
      })
    );
  });

  it('blocks persistence for unusable zero-confidence content', () => {
    expect(
      critiqueExtraction({
        confidence: 0,
        warnings: ['Document text was empty.'],
        metrics: { byteLength: 0, textLength: 0, hasText: false },
      })
    ).toEqual({
      decision: 'failed',
      confidence: 0,
      warnings: ['Document text was empty.'],
      warningCodes: ['zero_confidence', 'unusable_content'],
      escalationRecommended: true,
      persistenceAllowed: false,
    });
  });
});

describe('validateExtractionCandidate', () => {
  it('throws a validation-oriented pipeline error before critique', () => {
    const schema = z.object({ amount: z.number() }).strict();

    expect(() => validateExtractionCandidate('policy_extract', schema, { amount: '100' })).toThrow(
      ExtractionPipelineError
    );
    expect(() => validateExtractionCandidate('policy_extract', schema, { amount: '100' })).toThrow(
      'policy_extract output failed schema validation.'
    );
  });
});
