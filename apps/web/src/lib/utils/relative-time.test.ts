import { describe, expect, it } from 'vitest';
import { formatRelativeTime, toRelativeTimeLocaleTag } from './relative-time';

const NOW = new Date('2026-11-12T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe('formatRelativeTime', () => {
  it('renders Serbian in Latin script', () => {
    expect(toRelativeTimeLocaleTag('sr')).toBe('sr-Latn-RS');
    const text = formatRelativeTime(minutesAgo(11), NOW, 'sr');
    expect(text).toMatch(/11/);
    expect(text).not.toMatch(/[Ѐ-ӿ]/);
  });

  it('keeps Macedonian in Cyrillic and other locales unchanged', () => {
    expect(formatRelativeTime(minutesAgo(11), NOW, 'mk')).toMatch(/[Ѐ-ӿ]/);
    expect(toRelativeTimeLocaleTag('de')).toBe('de');
    expect(formatRelativeTime(minutesAgo(11), NOW, 'en')).toBe('11 minutes ago');
  });

  it('picks the largest whole unit', () => {
    expect(formatRelativeTime(minutesAgo(120), NOW, 'en')).toBe('2 hours ago');
    expect(formatRelativeTime(minutesAgo(3 * 24 * 60), NOW, 'en')).toBe('3 days ago');
    expect(formatRelativeTime(new Date(NOW.getTime() - 5_000), NOW, 'en')).toBe('5 seconds ago');
  });
});
