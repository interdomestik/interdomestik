import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/locales';

export { LOCALES as ACTION_LOCALES, type AppLocale };

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function refererLocale(requestHeaders?: Headers | null): AppLocale | null {
  const referer = requestHeaders?.get('referer');
  if (!referer) return null;
  try {
    const [, segment] = new URL(referer).pathname.split('/');
    return isAppLocale(segment) ? segment : null;
  } catch {
    return null;
  }
}

/**
 * The locale a server action renders copy in. Server actions never run the locale layout, and the
 * proxy sets no next-intl locale header, so an implicit `getLocale()` there always fell back to the
 * default. Use the caller's validated route locale, else the page that posted the action, and the
 * default only when neither is known.
 */
export function resolveActionLocale(explicit: unknown, requestHeaders?: Headers | null): AppLocale {
  if (isAppLocale(explicit)) return explicit;
  return refererLocale(requestHeaders) ?? DEFAULT_LOCALE;
}
