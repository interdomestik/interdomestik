import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import { loadAllMessages } from './messages';

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: await loadAllMessages(locale),
  };
});
