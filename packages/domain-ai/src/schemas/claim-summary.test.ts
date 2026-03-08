import { describe, expect, it } from 'vitest';

import { claimSummarySchema } from './claim-summary';

describe('claimSummarySchema', () => {
  it('accepts a valid claim summary payload', () => {
    expect(
      claimSummarySchema.parse({
        summary: 'The member has a strong documentation trail and a moderate compensation amount.',
        keyPoints: ['Receipts are attached.', 'Airline acknowledged the delay in writing.'],
        recommendedActions: [
          'Proceed with carrier demand letter.',
          'Request settlement within 7 days.',
        ],
        urgency: 'medium',
        confidence: 0.86,
        warnings: [],
      })
    ).toBeTruthy();
  });

  it('rejects invalid urgency values', () => {
    expect(() =>
      claimSummarySchema.parse({
        summary: 'The member has a strong documentation trail and a moderate compensation amount.',
        keyPoints: ['Receipts are attached.', 'Airline acknowledged the delay in writing.'],
        recommendedActions: [
          'Proceed with carrier demand letter.',
          'Request settlement within 7 days.',
        ],
        urgency: 'critical',
        confidence: 0.86,
        warnings: [],
      })
    ).toThrow();
  });
});
