import { describe, expect, it } from 'vitest';
import {
  renderThankYouLetterEmail,
  type ConfirmationLocale,
  type ThankYouLetterParams,
} from './thank-you-letter';

const baseParams: ThankYouLetterParams = {
  memberName: 'Member One',
  memberNumber: 'MBR-1',
  planName: 'Annual membership',
  planPrice: 'EUR 99.00',
  planInterval: 'year',
  memberSince: 'September 25, 2026',
  expiresAt: 'September 25, 2027',
  providerReference: 'sub_provider_1',
  dashboardUrl: 'https://ks.interdomestik.com/en/member/membership',
  locale: 'en',
};

describe('provider-backed membership confirmation template', () => {
  it.each([
    ['en', 'Membership confirmed', 'This email did not submit a case.'],
    ['sq', 'Anëtarësimi u konfirmua', 'Ky email nuk dorëzoi asnjë rast.'],
    ['mk', 'Членството е потврдено', 'Оваа е-пошта не поднесе случај.'],
    ['sr', 'Članstvo je potvrđeno', 'Ova poruka nije podnela slučaj.'],
  ] as const)('renders truthful %s confirmation copy', (locale, subject, caseBoundary) => {
    const template = renderThankYouLetterEmail({ ...baseParams, locale });

    expect(template.subject).toBe(subject);
    expect(template.html).toContain(`lang="${locale}"`);
    expect(template.text).toContain('sub_provider_1');
    expect(template.text).toContain(caseBoundary);
    expect(template.html).toContain(baseParams.dashboardUrl);
  });

  it('omits unverified marketing, benefit, refund and protection claims', () => {
    const rendered = (['en', 'sq', 'mk', 'sr'] as ConfirmationLocale[])
      .map(locale => renderThankYouLetterEmail({ ...baseParams, locale }))
      .map(template => template.text)
      .join('\n');

    for (const unsupportedClaim of [
      '8,500+',
      '24/7',
      '100%',
      '30-day',
      'Legal Protection',
      'Full Claims Management',
    ]) {
      expect(rendered).not.toContain(unsupportedClaim);
    }
  });

  it('escapes member and provider values before rendering HTML', () => {
    const template = renderThankYouLetterEmail({
      ...baseParams,
      memberName: '<script>alert(1)</script>',
      providerReference: 'sub_<unsafe>',
    });

    expect(template.html).not.toContain('<script>');
    expect(template.html).toContain('&lt;script&gt;');
    expect(template.html).toContain('sub_&lt;unsafe&gt;');
  });
});
