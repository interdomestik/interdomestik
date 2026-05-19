import { MINIMUM_COUNTRY_RULE_CONFIDENCE } from '../types';

export function minimumCountryRuleConfidence(value: number | undefined): number {
  if (!isFiniteConfidence(value) || value < 0 || value > 1) {
    return MINIMUM_COUNTRY_RULE_CONFIDENCE;
  }

  return value < MINIMUM_COUNTRY_RULE_CONFIDENCE ? MINIMUM_COUNTRY_RULE_CONFIDENCE : value;
}

export function normalizeStaleAfterDays(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function uniqueNonEmptyStrings(values: readonly string[]): readonly string[] {
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length > 0 && !output.includes(normalized)) {
      output.push(normalized);
    }
  }

  return output;
}

export function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function isFiniteConfidence(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeCountry(country: string | undefined): string {
  return typeof country === 'string' ? country.trim().toLocaleUpperCase('en-US') : '';
}
