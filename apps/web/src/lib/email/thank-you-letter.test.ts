import { describe, expect, it } from 'vitest';
import { renderThankYouLetterEmail, ThankYouLetterParams } from './thank-you-letter';

describe('renderThankYouLetterEmail', () => {
  const mockParams: ThankYouLetterParams = {
    memberName: 'John Doe',
    memberNumber: 'M-12345678',
    planName: 'Standard',
    planPrice: '€20.00',
    planInterval: 'year',
    memberSince: 'December 22, 2025',
    expiresAt: 'December 22, 2026',
    qrCodeDataUrl: 'data:image/png;base64,mockqrdata',
    locale: 'en',
  };

  it('generates correct subject and html for English', () => {
    const result = renderThankYouLetterEmail(mockParams);
    expect(result.subject).toContain('Welcome to Asistenca');
    expect(result.html).toContain('John Doe');
    expect(result.html).toContain('M-12345678');
    expect(result.html).toContain('Standard');
    expect(result.html).toContain('€20.00/year');
    expect(result.html).toContain('8,500+'); // Trust signal
  });

  it('generates correct translations for Albanian', () => {
    const result = renderThankYouLetterEmail({ ...mockParams, locale: 'sq' });
    expect(result.subject).toContain('Mirësevini në Asistenca');
    expect(result.html).toContain('John Doe');
    expect(result.html).toContain('Numri i Anëtarit');
    expect(result.html).toContain('M-12345678');
  });

  it('includes QR code when provided', () => {
    const result = renderThankYouLetterEmail(mockParams);
    expect(result.html).toContain('alt="QR Code"');
    expect(result.html).toContain('data:image/png;base64,mockqrdata');
  });

  it('handles missing QR code', () => {
    const { qrCodeDataUrl, ...paramsWithoutQr } = mockParams;
    const result = renderThankYouLetterEmail(paramsWithoutQr);
    expect(result.html).not.toContain('alt="QR Code"');
  });
});
