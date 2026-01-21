import { getRequestConfig } from 'next-intl/server';
import { getIntlMessageFallback, isStrictI18n, onIntlError } from './error-handling';
import { loadAllMessages } from './messages';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  const strict = isStrictI18n();

  return {
    locale,
    messages: await loadAllMessages(locale, { strict }),
    onError: onIntlError,
    getMessageFallback: getIntlMessageFallback,
  };
});
