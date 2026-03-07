export const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

export const DEFAULT_LOCALE = 'sq';

export type AppLocale = (typeof LOCALES)[number];
