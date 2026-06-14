const CURRENCY_MINOR_UNITS: Record<string, number> = {
  AED: 2,
  AUD: 2,
  BHD: 3,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CLP: 0,
  CNY: 2,
  CZK: 2,
  DKK: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  ILS: 2,
  INR: 2,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  MXN: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PLN: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TND: 3,
  TRY: 2,
  TWD: 2,
  USD: 2,
  ZAR: 2,
};

function pow10(decimals: number): bigint {
  return BigInt(10 ** decimals);
}

export function toMinorUnitAmount(amount: string, currencyCode: string): string {
  const decimals = CURRENCY_MINOR_UNITS[currencyCode.trim().toUpperCase()];
  if (decimals == null) throw new Error('success-fee billing currency is unsupported');

  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) throw new Error('success-fee billing requires a positive fee amount');

  const fractional = match[2] ?? '';
  const minorDigits = (fractional + '0'.repeat(decimals)).slice(0, decimals);
  const roundingDigit = fractional[decimals] ?? '0';
  let minor = BigInt(match[1]) * pow10(decimals) + BigInt(minorDigits || '0');

  if (roundingDigit >= '5') minor += 1n;
  if (minor <= 0n) throw new Error('success-fee billing requires a positive fee amount');
  return minor.toString();
}
