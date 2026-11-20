import { describe, expect, it } from 'vitest';
import { formatRelativeTime, toRelativeTimeLocaleTag } from './relative-time';

const NOW = new Date('2026-11-12T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

const UNIT_MINUTES = {
  minute: 1,
  hour: 60,
  day: 24 * 60,
  week: 7 * 24 * 60,
  month: 30 * 24 * 60,
  year: 365 * 24 * 60,
} as const;
const LIMITS = { minute: 59, hour: 23, day: 6, week: 4, month: 12, year: 25 } as const;
const COUNTS = [1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 25];

describe('formatRelativeTime', () => {
  it.each(['en', 'sq', 'de', 'sr', 'mk'])(
    'matches full-ICU CLDR past phrases for %s without using browser ICU',
    locale => {
      const reference = new Intl.RelativeTimeFormat(toRelativeTimeLocaleTag(locale), {
        numeric: 'always',
      });
      for (const [unit, minutes] of Object.entries(UNIT_MINUTES)) {
        const limit = LIMITS[unit as keyof typeof LIMITS];
        for (const count of COUNTS.filter(value => value <= limit)) {
          expect(formatRelativeTime(minutesAgo(count * minutes), NOW, locale)).toBe(
            reference.format(-count, unit as Intl.RelativeTimeFormatUnit)
          );
        }
      }
    }
  );

  it('renders Serbian in Latin script and Macedonian in Cyrillic', () => {
    expect(toRelativeTimeLocaleTag('sr')).toBe('sr-Latn-RS');
    expect(formatRelativeTime(minutesAgo(11), NOW, 'sr')).not.toMatch(/[Ѐ-ӿ]/);
    expect(formatRelativeTime(minutesAgo(11), NOW, 'mk')).toMatch(/[Ѐ-ӿ]/);
  });

  it('never renders a signed or root-locale value', () => {
    for (const locale of ['sq', 'sr', 'mk', 'de', 'en']) {
      for (const minutes of [10, 60, 13 * 60, 24 * 60]) {
        expect(formatRelativeTime(minutesAgo(minutes), NOW, locale)).not.toMatch(/^-|\bh\b|\bd\b/);
      }
    }
  });

  it('picks the largest whole unit and never calendar words', () => {
    expect(formatRelativeTime(minutesAgo(90), NOW, 'en')).toBe('1 hour ago');
    expect(formatRelativeTime(minutesAgo(3 * 24 * 60), NOW, 'en')).toBe('3 days ago');
    expect(formatRelativeTime(minutesAgo(26 * 60), NOW, 'sq')).toBe('1 ditë më parë');
  });

  it('reads sub-minute and future values as just now', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5_000), NOW, 'en')).toBe('just now');
    expect(formatRelativeTime(new Date(NOW.getTime() + 90_000), NOW, 'sq')).toBe('tani');
    expect(formatRelativeTime(minutesAgo(5), NOW, 'constructor')).toBe('5 minutes ago');
  });
});
