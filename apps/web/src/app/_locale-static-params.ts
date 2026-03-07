const STATIC_LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

export function generateLocaleStaticParams() {
  return STATIC_LOCALES.map(locale => ({ locale }));
}
