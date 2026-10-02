import { describe, expect, it } from 'vitest';
import { formatClaimAmount } from './currency';

describe('formatClaimAmount', () => {
  it('formats a positive EUR amount with the given locale', () => {
    expect(formatClaimAmount('1200.00', 'EUR', 'en')).toBe(
      new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(1200)
    );
  });

  it('formats an MKD amount distinctly from EUR', () => {
    const result = formatClaimAmount('2500.5', 'MKD', 'en');
    expect(result).toBe(
      new Intl.NumberFormat('en', { style: 'currency', currency: 'MKD' }).format(2500.5)
    );
    expect(result).not.toContain('\u20ac');
  });

  it('retains a zero amount instead of treating it as absent', () => {
    expect(formatClaimAmount('0.00', 'EUR', 'en')).toBe(
      new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(0)
    );
  });

  it('returns null for a null amount', () => {
    expect(formatClaimAmount(null, 'EUR', 'en')).toBeNull();
  });

  it('returns null for an empty amount string', () => {
    expect(formatClaimAmount('', 'EUR', 'en')).toBeNull();
  });

  it('returns null instead of NaN for a non-numeric amount', () => {
    expect(formatClaimAmount('not-a-number', 'EUR', 'en')).toBeNull();
  });

  it.each([null, '', 'NOT_A_CODE', '123'])(
    'returns null for absent or malformed currency %s',
    currency => {
      expect(formatClaimAmount('900', currency, 'en')).toBeNull();
    }
  );

  it.each(['0x10', '1e3', '1200junk', 'Infinity'])('rejects non-decimal amount %s', amount => {
    expect(formatClaimAmount(amount, 'EUR', 'en')).toBeNull();
  });

  it.each(['en', 'sq', 'mk', 'sr'])('uses the current supported locale %s', locale => {
    expect(formatClaimAmount('1200.50', 'EUR', locale)).toBe(
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(1200.5)
    );
  });
});
