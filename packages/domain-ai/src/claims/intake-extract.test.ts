import { describe, expect, it } from 'vitest';

import { extractClaimIntake } from './intake-extract';

describe('extractClaimIntake', () => {
  it('maps claim context and document text into the typed intake schema', async () => {
    const result = await extractClaimIntake({
      claim: {
        title: 'Flight cancellation reimbursement',
        description: 'My flight from Berlin to Rome was cancelled and I had to rebook.',
        category: 'travel',
        claimAmount: '650.00',
        currency: 'EUR',
      },
      claimSnapshot: {
        incidentDate: '2026-02-15',
      },
      documentText:
        'Passenger itinerary. Country: IT. Cancellation notice. Expenses claimed EUR 650.',
      uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
    });

    expect(result).toEqual({
      title: 'Flight cancellation reimbursement',
      summary: expect.stringContaining('Flight cancellation reimbursement'),
      category: 'travel',
      incidentDate: '2026-02-15',
      countryCode: 'IT',
      estimatedAmount: 650,
      currency: 'EUR',
      confidence: expect.any(Number),
      warnings: expect.any(Array),
    });
  });

  it('falls back safely when the claim payload is sparse', async () => {
    const result = await extractClaimIntake({
      claim: {
        title: 'Unknown issue',
        description: '',
        category: 'mystery',
        claimAmount: null,
        currency: null,
      },
      documentText: '',
      uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
    });

    expect(result.category).toBe('other');
    expect(result.countryCode).toBe('ZZ');
    expect(result.currency).toBe('EUR');
    expect(result.estimatedAmount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
