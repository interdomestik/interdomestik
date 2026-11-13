// Serbian copy in this app is Latin script; plain 'sr' would make Intl answer in Cyrillic.
const RELATIVE_TIME_LOCALE_TAGS: ReadonlyMap<string, string> = new Map([['sr', 'sr-Latn-RS']]);

type Unit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
type PluralForm = 'one' | 'few' | 'other';
type UnitPatterns = Readonly<Partial<Record<PluralForm, string>> & { other: string }>;
type LocalePatterns = Readonly<{ now: string; units: Readonly<Record<Unit, UnitPatterns>> }>;

const UNITS: ReadonlyArray<readonly [Unit, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/*
 * Past-tense patterns follow CLDR (checked against Node's full ICU in the unit test). They live
 * here instead of Intl.RelativeTimeFormat because browser ICU builds can lack sq/mk/sr data and
 * fall back to the root pattern ("-1 h").
 */
const PATTERNS: Readonly<Record<string, LocalePatterns>> = {
  en: {
    now: 'just now',
    units: {
      minute: { one: '# minute ago', other: '# minutes ago' },
      hour: { one: '# hour ago', other: '# hours ago' },
      day: { one: '# day ago', other: '# days ago' },
      week: { one: '# week ago', other: '# weeks ago' },
      month: { one: '# month ago', other: '# months ago' },
      year: { one: '# year ago', other: '# years ago' },
    },
  },
  sq: {
    now: 'tani',
    units: {
      minute: { one: '# minutë më parë', other: '# minuta më parë' },
      hour: { other: '# orë më parë' },
      day: { other: '# ditë më parë' },
      week: { other: '# javë më parë' },
      month: { other: '# muaj më parë' },
      year: { one: '# vit më parë', other: '# vjet më parë' },
    },
  },
  de: {
    now: 'gerade eben',
    units: {
      minute: { one: 'vor # Minute', other: 'vor # Minuten' },
      hour: { one: 'vor # Stunde', other: 'vor # Stunden' },
      day: { one: 'vor # Tag', other: 'vor # Tagen' },
      week: { one: 'vor # Woche', other: 'vor # Wochen' },
      month: { one: 'vor # Monat', other: 'vor # Monaten' },
      year: { one: 'vor # Jahr', other: 'vor # Jahren' },
    },
  },
  sr: {
    now: 'upravo sada',
    units: {
      minute: { other: 'pre # minuta' },
      hour: { one: 'pre # sata', few: 'pre # sata', other: 'pre # sati' },
      day: { other: 'pre # dana' },
      week: { one: 'pre # nedelje', few: 'pre # nedelje', other: 'pre # nedelja' },
      month: { one: 'pre # meseca', few: 'pre # meseca', other: 'pre # meseci' },
      year: { one: 'pre # godine', few: 'pre # godine', other: 'pre # godina' },
    },
  },
  mk: {
    now: 'сега',
    units: {
      minute: { one: 'пред # минута', other: 'пред # минути' },
      hour: { one: 'пред # час', other: 'пред # часа' },
      day: { one: 'пред # ден', other: 'пред # дена' },
      week: { one: 'пред # седмица', other: 'пред # седмици' },
      month: { one: 'пред # месец', other: 'пред # месеци' },
      year: { one: 'пред # година', other: 'пред # години' },
    },
  },
};

export function toRelativeTimeLocaleTag(locale: string): string {
  return RELATIVE_TIME_LOCALE_TAGS.get(locale) ?? locale;
}

// CLDR cardinal rules for whole numbers in the five app locales.
function pluralForm(locale: string, count: number): PluralForm {
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (locale === 'sr' || locale === 'mk') {
    if (lastDigit === 1 && lastTwo !== 11) return 'one';
    const isFew = lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14);
    return locale === 'sr' && isFew ? 'few' : 'other';
  }
  return count === 1 ? 'one' : 'other';
}

/**
 * Formats a past `date` relative to `now` ("11 minutes ago") in the app locale without relying on
 * the runtime's ICU data. Future and sub-minute values read as "just now".
 */
export function formatRelativeTime(date: Date, now: Date, locale: string): string {
  const patterns = Object.hasOwn(PATTERNS, locale) ? PATTERNS[locale] : PATTERNS.en;
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  // Whole units only: a 26-hour-old item is "1 day ago", never calendar words like "yesterday".
  const match = UNITS.find(([, size]) => seconds >= size);
  if (!match) return patterns.now;
  const [unit, size] = match;
  const count = Math.floor(seconds / size);
  const forms = patterns.units[unit];
  return (forms[pluralForm(locale, count)] ?? forms.other).replace('#', String(count));
}
