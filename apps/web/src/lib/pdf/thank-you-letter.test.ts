import { ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import { describe, expect, it } from 'vitest';
import { generateThankYouPDF } from './thank-you-letter';

describe('generateThankYouPDF', () => {
  const mockParams: ThankYouLetterParams = {
    memberName: 'John Doe',
    memberNumber: 'M-12345678',
    planName: 'Standard',
    planPrice: '€20.00',
    planInterval: 'year',
    memberSince: 'December 22, 2025',
    expiresAt: 'December 22, 2026',
    locale: 'en',
  };

  it('should generate a valid PDF stream', async () => {
    const pdfBuffer = await generateThankYouPDF(mockParams);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('handles missing QR code', async () => {
    const { ...paramsWithoutQr } = mockParams;
    const pdfBuffer = await generateThankYouPDF(paramsWithoutQr);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });
});
