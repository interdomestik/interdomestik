import { describe, expect, it } from 'vitest';

import { extractLegalDocument } from './extract';

describe('extractLegalDocument', () => {
  it('extracts a typed legal payload from document text', async () => {
    const result = await extractLegalDocument({
      documentText:
        'Demand letter issued by Contoso Legal in Germany on 2026-02-20. You must respond within 14 days and preserve all receipts.',
      fileName: 'demand-letter.pdf',
      uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
    });

    expect(result).toEqual({
      documentType: 'demand_letter',
      issuer: expect.stringContaining('Contoso Legal'),
      jurisdiction: expect.stringContaining('Germany'),
      effectiveDate: '2026-02-20',
      summary: expect.stringContaining('Demand letter'),
      obligations: expect.arrayContaining([expect.stringContaining('respond within 14 days')]),
      confidence: expect.any(Number),
      warnings: expect.any(Array),
    });
  });

  it('returns a low-confidence placeholder when the document text is empty', async () => {
    const result = await extractLegalDocument({
      documentText: '',
      fileName: 'legal-upload.png',
      uploadedAt: new Date('2026-03-08T10:00:00.000Z'),
    });

    expect(result.documentType).toBe('other');
    expect(result.issuer).toBe('Unknown issuer');
    expect(result.jurisdiction).toBe('Unknown jurisdiction');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
