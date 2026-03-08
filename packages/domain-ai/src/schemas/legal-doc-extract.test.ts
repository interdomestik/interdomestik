import { describe, expect, it } from 'vitest';

import { legalDocExtractSchema } from './legal-doc-extract';

describe('legalDocExtractSchema', () => {
  it('accepts a valid legal document extraction payload', () => {
    expect(
      legalDocExtractSchema.parse({
        documentType: 'court_filing',
        issuer: 'Munich District Court',
        jurisdiction: 'DE-BY',
        effectiveDate: '2026-02-20',
        summary: 'Court filing requesting additional evidence from the claimant.',
        obligations: ['Submit the requested receipts within 14 days.'],
        confidence: 0.9,
        warnings: [],
      })
    ).toBeTruthy();
  });

  it('rejects invalid confidence values', () => {
    expect(() =>
      legalDocExtractSchema.parse({
        documentType: 'court_filing',
        issuer: 'Munich District Court',
        jurisdiction: 'DE-BY',
        effectiveDate: '2026-02-20',
        summary: 'Court filing requesting additional evidence from the claimant.',
        obligations: ['Submit the requested receipts within 14 days.'],
        confidence: 1.5,
        warnings: [],
      })
    ).toThrow();
  });
});
