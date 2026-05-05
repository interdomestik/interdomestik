const LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

export type SupportHandoffActionLocale = (typeof LOCALES)[number];

function isLocale(value: string | undefined): value is SupportHandoffActionLocale {
  return LOCALES.includes(value as SupportHandoffActionLocale);
}

export function eachSupportHandoffActionLocale(
  callback: (locale: SupportHandoffActionLocale) => void
) {
  for (const locale of LOCALES) {
    callback(locale);
  }
}

export function resolveSupportHandoffActionLocale(
  requestHeaders?: Headers
): SupportHandoffActionLocale {
  const referer = requestHeaders?.get('referer');
  if (referer) {
    try {
      const [, locale] = new URL(referer).pathname.split('/');
      if (isLocale(locale)) {
        return locale;
      }
    } catch {
      // Fall through to Accept-Language.
    }
  }

  const acceptLanguage = requestHeaders?.get('accept-language') ?? '';
  const requestedLocale = acceptLanguage
    .split(',')
    .map(value => value.trim().split(';')[0]?.split('-')[0])
    .find(isLocale);

  return requestedLocale ?? 'sq';
}
