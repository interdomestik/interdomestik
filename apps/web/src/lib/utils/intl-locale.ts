const INTL_LOCALE_TAGS: ReadonlyMap<string, string> = new Map([
  ['de', 'de-DE'],
  ['mk', 'mk-MK'],
  ['sq', 'sq-AL'],
  ['sr', 'sr-Latn-RS'],
]);

/** Maps an app locale to the Intl tag used for admin dates and amounts; unknown locales use en-US. */
export function toIntlLocaleTag(locale: string): string {
  return INTL_LOCALE_TAGS.get(locale) ?? 'en-US';
}
