import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/locales';
import de from '@/messages/de/common.json';
import en from '@/messages/en/common.json';
import mk from '@/messages/mk/common.json';
import sq from '@/messages/sq/common.json';
import sr from '@/messages/sr/common.json';

const catalogs = { sq, en, sr, mk, de };

export function errorLocale(value: string | undefined): AppLocale {
  return LOCALES.find(locale => locale === value) ?? DEFAULT_LOCALE;
}

// Global errors replace the root provider, so this copy also works without next-intl context.
export function getPortalErrorCopy(locale: string) {
  return catalogs[errorLocale(locale)].common.portalError;
}
