import { describe, expect, it } from 'vitest';

import { policyExtractSchema } from './policy-extract';

describe('policyExtractSchema', () => {
  it('accepts a valid extraction payload', () => {
    expect(
      policyExtractSchema.parse({
        provider: 'Allianz',
        policyNumber: 'POL-12345',
        coverageAmount: 75000,
        currency: 'EUR',
        deductible: 1000,
        confidence: 0.92,
        warnings: [],
      })
    ).toBeTruthy();
  });

  it('accepts null fact fields with warnings for unsupported extracted facts', () => {
    expect(
      policyExtractSchema.parse({
        provider: null,
        policyNumber: null,
        coverageAmount: 0,
        currency: 'EUR',
        deductible: 0,
        confidence: 0.32,
        warnings: [
          'Provider could not be extracted from the uploaded policy.',
          'Policy number could not be extracted from the uploaded policy.',
        ],
        hiddenPerks: [],
        summary: 'Insurance welcome letter with general terms only.',
      })
    ).toBeTruthy();
  });

  it('rejects non-numeric amounts', () => {
    expect(() =>
      policyExtractSchema.parse({
        provider: 'Allianz',
        policyNumber: 'POL-12345',
        coverageAmount: '75000',
        currency: 'EUR',
        deductible: 1000,
        confidence: 0.92,
        warnings: [],
      })
    ).toThrow();
  });
});
