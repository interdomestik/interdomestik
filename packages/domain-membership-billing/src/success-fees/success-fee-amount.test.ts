import { describe, expect, it } from 'vitest';

import { toMinorUnitAmount } from './success-fee-amount';

describe('toMinorUnitAmount', () => {
  it('uses three decimal minor units for supported currencies', () => {
    expect(toMinorUnitAmount('1.234', 'KWD')).toBe('1234');
  });

  it('uses zero decimal minor units for supported currencies', () => {
    expect(toMinorUnitAmount('123.50', 'JPY')).toBe('124');
  });

  it('rejects unsupported currencies instead of guessing minor units', () => {
    expect(() => toMinorUnitAmount('1.23', 'ZZZ')).toThrow(/currency is unsupported/);
  });

  it('normalizes currency code whitespace', () => {
    expect(toMinorUnitAmount('1.23', ' EUR ')).toBe('123');
  });

  it('rejects zero or malformed amounts', () => {
    expect(() => toMinorUnitAmount('0.00', 'EUR')).toThrow(/positive fee amount/);
    expect(() => toMinorUnitAmount('not-money', 'EUR')).toThrow(/positive fee amount/);
  });
});
