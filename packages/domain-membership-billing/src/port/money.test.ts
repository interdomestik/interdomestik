import { describe, expect, expectTypeOf, it } from 'vitest';

import { toMkdMinor, type Money } from './money';

describe('payment port money', () => {
  it('holds bigint minor units and their currency', () => {
    const money: Money = { minor: 90_071_992_547_409_931n, currency: 'EUR' };
    expectTypeOf<Money>().toEqualTypeOf<Readonly<{ minor: bigint; currency: string }>>();
    expect(toMkdMinor(money.minor, '1')).toBe(90_071_992_547_409_900n);
  });

  it.each([
    [1n, '49.99999999', 0n],
    [1n, '50', 100n],
    [1n, '50.00000001', 100n],
    [-1n, '49.99999999', 0n],
    [-1n, '50', -100n],
    [-1n, '50.00000001', -100n],
    [99_999_999n, '151.00000001', 15_099_999_800n],
  ])('converts %s minor EUR at %s to %s minor MKD', (price, rate, expected) => {
    expect(toMkdMinor(price, rate)).toBe(expected);
  });

  it.each(['0', '-1', 'NaN', '1.000000001'])('refuses invalid rate %s', rate => {
    expect(() => toMkdMinor(100n, rate)).toThrow(RangeError);
  });
});
