const OPEN_GRAPH_LOCALES: ReadonlyMap<string, string> = new Map([
  ['de', 'de_DE'],
  ['sq', 'sq_AL'],
]);

/** OpenGraph `og:locale` for an app locale; other locales keep the en_US default. */
export function toOpenGraphLocale(locale: string): string {
  return OPEN_GRAPH_LOCALES.get(locale) ?? 'en_US';
}
