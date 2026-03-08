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
