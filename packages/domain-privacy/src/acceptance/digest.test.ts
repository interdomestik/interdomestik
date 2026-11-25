import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { digestLegalDocument } from './digest';

describe('digestLegalDocument', () => {
  it('hashes rendered values in order, separated by newlines and normalized to NFC', () => {
    const expected = createHash('sha256')
      .update('Café\nÅrsavtal\nBilling terms', 'utf8')
      .digest('hex');
    expect(digestLegalDocument(['Cafe\u0301', 'A\u030Arsavtal', 'Billing terms'])).toBe(expected);
  });

  it('changes when a rendered value changes or moves', () => {
    const values = ['Terms', 'Privacy'];
    expect(digestLegalDocument(values)).not.toBe(digestLegalDocument(['Privacy', 'Terms']));
    expect(digestLegalDocument(values)).not.toBe(digestLegalDocument(['Terms', 'New privacy']));
  });
});
