import { describe, expect, it } from 'vitest';

import { summarizeClaim } from './summary';

describe('summarizeClaim', () => {
  it('builds a typed staff summary from claim context', async () => {
    const result = await summarizeClaim({
      claim: {
        title: 'Delayed baggage claim',
        description: 'Airline lost my luggage for three days.',
        category: 'travel',
        companyName: 'Airline Co',
        claimAmount: '1200.00',
        currency: 'EUR',
      },
      extractions: [
        {
          summary: 'The uploaded baggage report confirms a three-day delay.',
          warnings: ['Receipt totals still need confirmation'],
        },
      ],
    });

    expect(result).toEqual({
      summary: expect.stringContaining('Delayed baggage claim'),
      keyPoints: expect.arrayContaining([
        expect.stringContaining('travel'),
        expect.stringContaining('Airline Co'),
      ]),
      recommendedActions: expect.any(Array),
      urgency: 'medium',
      confidence: expect.any(Number),
      warnings: expect.arrayContaining(['Receipt totals still need confirmation']),
    });
  });
});
