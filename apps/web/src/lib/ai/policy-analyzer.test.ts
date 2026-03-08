import { describe, expect, it } from 'vitest';

import { analyzePolicyText } from './policy-analyzer';

describe('analyzePolicyText', () => {
  it('extracts labeled numeric policy amounts from text', async () => {
    const result = await analyzePolicyText(
      'Home insurance policy number POL-12345. Coverage: EUR 75000. Deductible: EUR 1000.'
    );

    expect(result).toEqual({
      provider: undefined,
      policyNumber: 'POL-12345',
      coverageAmount: '75000',
      currency: 'EUR',
      deductible: '1000',
      hiddenPerks: [],
      summary: 'Home insurance policy number POL-12345. Coverage: EUR 75000. Deductible: EUR 1000.',
    });
  });
});
