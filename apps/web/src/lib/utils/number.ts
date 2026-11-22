import { toIntlLocaleTag } from './intl-locale';

export type FormatNumberOptions = {
  style?: 'decimal' | 'percent';
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

const STYLES: ReadonlySet<string> = new Set(['decimal', 'percent']);

const isDigitCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 20;

/**
 * A plain number or a percent (a ratio: 0.125 → 12.5 %) in the locale's own grouping, through the
 * canonical locale map. Money never goes through here: it has the helpers of `currency.ts`. Only the
 * three named options are read, so no cast or dynamic object can turn this into a currency format.
 * Returns null, never throws, for a non-finite value or invalid fraction digits.
 */
export function formatNumber(
  value: number,
  locale: string,
  options: FormatNumberOptions = {}
): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const style = options.style ?? 'decimal';
  if (!STYLES.has(style)) return null;
  const { minimumFractionDigits: min, maximumFractionDigits: max } = options;
  if (min !== undefined && !isDigitCount(min)) return null;
  if (max !== undefined && !isDigitCount(max)) return null;
  if (min !== undefined && max !== undefined && min > max) return null;
  const intlOptions: Intl.NumberFormatOptions = { style };
  if (min !== undefined) intlOptions.minimumFractionDigits = min;
  if (max !== undefined) intlOptions.maximumFractionDigits = max;
  try {
    return new Intl.NumberFormat(toIntlLocaleTag(locale), intlOptions).format(value);
  } catch {
    return null;
  }
}
