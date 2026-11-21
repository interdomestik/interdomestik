import { describe, expect, it } from 'vitest';

import { formatNumber } from './number';

const NBSP = ' ';
const NNBSP = ' ';

describe('formatNumber', () => {
  it.each([
    ['en', '12,345.5'],
    ['de', '12.345,5'],
    ['sq', `12${NBSP}345,5`],
    ['mk', '12.345,5'],
    ['sr', '12.345,5'],
  ])('formats a decimal in %s with its own grouping', (locale, expected) => {
    expect(formatNumber(12345.5, locale)).toBe(expected);
  });

  it('keeps the locale minimum grouping (sq groups from five digits)', () => {
    expect(formatNumber(1234.5, 'sq')).toBe('1234,5');
    expect(formatNumber(1234.5, 'de')).toBe('1.234,5');
  });

  it('falls back to en-US for an unknown locale', () => {
    expect(formatNumber(1234.5, 'hr')).toBe('1,234.5');
  });

  it('formats a percent from a ratio', () => {
    expect(formatNumber(0.125, 'en', { style: 'percent', maximumFractionDigits: 1 })).toBe('12.5%');
    expect(formatNumber(0.125, 'de', { style: 'percent', maximumFractionDigits: 1 })).toBe(
      `12,5${NBSP}%`
    );
  });

  it('applies the fraction digit bounds', () => {
    expect(formatNumber(2, 'en', { minimumFractionDigits: 2 })).toBe('2.00');
    expect(formatNumber(2.345, 'en', { maximumFractionDigits: 0 })).toBe('2');
    expect(formatNumber(1, 'en', { minimumFractionDigits: 20, maximumFractionDigits: 20 })).toBe(
      '1.00000000000000000000'
    );
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('returns null for %s', (_label, value) => {
    expect(formatNumber(value, 'en')).toBeNull();
  });

  it('returns null for a value that is not a number at run time', () => {
    expect(formatNumber('12' as unknown as number, 'en')).toBeNull();
  });

  it.each([
    [{ minimumFractionDigits: -1 }],
    [{ maximumFractionDigits: 21 }],
    [{ minimumFractionDigits: 1.5 }],
    [{ minimumFractionDigits: 3, maximumFractionDigits: 2 }],
  ])('returns null for fraction digits %j', options => {
    expect(formatNumber(1, 'en', options)).toBeNull();
  });

  it('never formats money, even through a cast or a dynamic object', () => {
    const smuggled = { style: 'currency', currency: 'EUR' } as unknown as { style: 'decimal' };
    expect(formatNumber(1, 'en', smuggled)).toBeNull();
    const extra = { currency: 'EUR', currencyDisplay: 'code' } as unknown as Record<string, never>;
    expect(formatNumber(1, 'en', extra)).toBe('1');
  });

  it('keeps a negative zero and a negative value readable', () => {
    expect(formatNumber(-1234.5, 'en')).toBe('-1,234.5');
    expect(formatNumber(0, 'en')).toBe('0');
  });

  it('does not use a narrow no-break space where the locale has none', () => {
    expect(formatNumber(1234.5, 'en')).not.toContain(NNBSP);
  });
});
