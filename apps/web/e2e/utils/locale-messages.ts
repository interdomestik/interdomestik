import type { TestInfo } from '@playwright/test';
import { routes, type Locale } from '../routes';

/**
 * Picks the project's catalogue so assertions read the label the page renders in its locale. The
 * locales without their own catalogue file fall back to Albanian, the app's default locale.
 */
export function messagesFor<T>(catalogues: { en: T; mk: T; sq: T; sr: T }, testInfo: TestInfo): T {
  const locale: Locale = routes.getLocale(testInfo);
  return locale === 'en' || locale === 'mk' || locale === 'sr' ? catalogues[locale] : catalogues.sq;
}
