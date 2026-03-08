import { describe, expect, it } from 'vitest';

import { claimIntakeExtractSchema } from './claim-intake-extract';

describe('claimIntakeExtractSchema', () => {
  it('accepts a valid intake extraction payload', () => {
    expect(
      claimIntakeExtractSchema.parse({
        title: 'Delayed baggage compensation claim',
        summary: 'Member reports delayed baggage after arriving in Berlin.',
        category: 'travel',
        incidentDate: '2026-03-01',
        countryCode: 'DE',
        estimatedAmount: 450,
        currency: 'EUR',
        confidence: 0.88,
        warnings: [],
      })
    ).toBeTruthy();
  });

  it('rejects non-numeric estimated amounts', () => {
    expect(() =>
      claimIntakeExtractSchema.parse({
        title: 'Delayed baggage compensation claim',
        summary: 'Member reports delayed baggage after arriving in Berlin.',
        category: 'travel',
        incidentDate: '2026-03-01',
        countryCode: 'DE',
        estimatedAmount: '450',
        currency: 'EUR',
        confidence: 0.88,
        warnings: [],
      })
    ).toThrow();
  });
});
