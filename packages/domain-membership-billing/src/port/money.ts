export type Money = Readonly<{ minor: bigint; currency: string }>;

const RATE_SCALE = 100_000_000n;
const MINOR_UNITS_PER_DENAR = 100n;
const DECIMAL_RATE = /^\d{1,10}(?:\.\d{1,8})?$/;

export function scaledExchangeRate(rate: string): bigint | null {
  if (!DECIMAL_RATE.test(rate)) return null;
  const [whole, fraction = ''] = rate.split('.');
  const scaled = BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(8, '0'));
  return scaled > 0n ? scaled : null;
}

export function toMkdMinor(priceMinor: bigint, rate: string): bigint {
  const scaledRate = scaledExchangeRate(rate);
  if (scaledRate === null) throw new RangeError('Expected a positive decimal exchange rate');

  const denominator = RATE_SCALE * MINOR_UNITS_PER_DENAR;
  const magnitude = priceMinor < 0n ? -priceMinor : priceMinor;
  const denars = (magnitude * scaledRate + denominator / 2n) / denominator;
  return (priceMinor < 0n ? -denars : denars) * MINOR_UNITS_PER_DENAR;
}
