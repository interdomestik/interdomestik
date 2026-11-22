import type { ClaimMailLocale } from '../types';

export function claimMailText(locale: ClaimMailLocale) {
  return (translations: Record<ClaimMailLocale, string>): string => translations[locale];
}
