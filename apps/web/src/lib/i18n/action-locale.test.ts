import { describe, expect, it } from 'vitest';
import { isAppLocale, resolveActionLocale } from './action-locale';

const fromPage = (path: string) => new Headers({ referer: `https://ida.example${path}` });

describe('resolveActionLocale', () => {
  it.each(['sq', 'en', 'sr', 'mk', 'de'])('keeps an explicit %s route locale', locale => {
    expect(resolveActionLocale(locale, fromPage('/sq/member'))).toBe(locale);
  });

  it('falls back to the posting page locale for a missing or invalid explicit value', () => {
    expect(resolveActionLocale(undefined, fromPage('/en/member/claims/new'))).toBe('en');
    expect(resolveActionLocale('hr', fromPage('/mk/member/notifications'))).toBe('mk');
    expect(resolveActionLocale({ locale: 'de' }, fromPage('/de/staff'))).toBe('de');
  });

  it('uses the default only when neither the caller nor the page names a locale', () => {
    expect(resolveActionLocale(undefined, fromPage('/api/x'))).toBe('sq');
    expect(resolveActionLocale(undefined, new Headers({ referer: 'not a url' }))).toBe('sq');
    expect(resolveActionLocale(undefined, null)).toBe('sq');
  });

  it('accepts only supported locales', () => {
    expect(isAppLocale('en')).toBe(true);
    expect(isAppLocale('hr')).toBe(false);
    expect(isAppLocale(1)).toBe(false);
  });
});
