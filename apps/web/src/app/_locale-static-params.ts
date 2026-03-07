import { LOCALES } from '@/i18n/locales';

export function generateLocaleStaticParams() {
  return LOCALES.map(locale => ({ locale }));
}
