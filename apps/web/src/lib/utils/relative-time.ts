// Serbian copy in this app is Latin script; plain 'sr' would make Intl answer in Cyrillic.
const RELATIVE_TIME_LOCALE_TAGS: ReadonlyMap<string, string> = new Map([['sr', 'sr-Latn-RS']]);

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

export function toRelativeTimeLocaleTag(locale: string): string {
  return RELATIVE_TIME_LOCALE_TAGS.get(locale) ?? locale;
}

/** Formats `date` relative to `now` ("11 minutes ago") in the app locale's script. */
export function formatRelativeTime(date: Date, now: Date, locale: string): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const match = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  // 'always' keeps "1 day ago": 'auto' would call a 26-hour-old item "yesterday" across two calendar days.
  const formatter = new Intl.RelativeTimeFormat(toRelativeTimeLocaleTag(locale), {
    numeric: 'always',
  });
  if (!match) return formatter.format(seconds, 'second');
  const [unit, size] = match;
  return formatter.format(Math.round(seconds / size), unit);
}
