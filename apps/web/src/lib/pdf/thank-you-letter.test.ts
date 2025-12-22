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
    qrCodeDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // 1x1 pixel base64
    locale: 'en',
  };

  it('generates a PDF buffer', async () => {
    const pdfBuffer = await generateThankYouPDF(mockParams);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });

  it('handles missing QR code', async () => {
    const { qrCodeDataUrl, ...paramsWithoutQr } = mockParams;
    const pdfBuffer = await generateThankYouPDF(paramsWithoutQr);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(0);
  });
});
