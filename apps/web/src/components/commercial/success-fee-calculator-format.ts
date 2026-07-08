import type { SuccessFeeWorkedExample } from './success-fee-calculator-content';
import { calculateSuccessFeeQuote } from './success-fee-calculator-content';

function getDeterministicNumberFormatLocale(locale: string) {
  return locale.toLowerCase().startsWith('en') ? 'en-US' : 'de-DE';
}

export function formatEuro(locale: string, amount: number) {
  const maximumFractionDigits = Number.isInteger(amount) ? 0 : 2;

  // Browser and Node ICU support differ for some app locales (for example `sq`),
  // so this widget uses deterministic formatting to avoid hydration mismatches.
  return `EUR ${new Intl.NumberFormat(getDeterministicNumberFormatLocale(locale), {
    maximumFractionDigits,
  }).format(amount)}`;
}

export function parseRecoveryAmount(input: string) {
  const amount = Number(input);

  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return amount;
}

export function getWorkedExampleFormula(locale: string, example: SuccessFeeWorkedExample) {
  const quote = calculateSuccessFeeQuote(example.planKey, example.recoveryAmount, {
    legalActionCap: example.legalActionCap,
  });
  const recoveryAmount = formatEuro(locale, quote.recoveryAmount);
  const feeAmount = formatEuro(locale, quote.feeAmount);
  const minimumFee = formatEuro(locale, quote.minimumFee);

  if (example.legalActionCap) {
    return `${quote.ratePercentage}% cap x ${recoveryAmount} = ${feeAmount} max`;
  }

  if (quote.minimumApplied) {
    return `max(${quote.ratePercentage}% x ${recoveryAmount}, ${minimumFee}) = ${feeAmount}`;
  }

  return `${quote.ratePercentage}% x ${recoveryAmount} = ${feeAmount}`;
}
