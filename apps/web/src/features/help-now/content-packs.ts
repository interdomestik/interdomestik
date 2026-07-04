export const HELP_NOW_CACHE_NAME = 'interdomestik-help-now-v1';
export const HELP_NOW_PACK_ASSET = '/help-now-packs/content-packs.v1.json';

export const HELP_NOW_CONTENT_LOCALES = ['en', 'sq', 'mk', 'sr', 'de'] as const;
export type HelpNowContentLocale = (typeof HELP_NOW_CONTENT_LOCALES)[number];
export type HelpNowScenario = 'car' | 'injury' | 'property' | 'flight';

export type HelpNowCountryPack = {
  country: 'XK' | 'MK' | 'AL' | 'DE' | 'AT' | 'HU' | 'RS' | 'HR' | 'ME';
  marketLabel: string;
  exposure: 'dark' | 'public';
  l2SignOff: { reviewer: string; date: string; packHash: string } | null;
  reviewStatus: 'not_started';
};

export type HelpNowCountry = HelpNowCountryPack['country'];

export const HELP_NOW_SCENARIOS: readonly HelpNowScenario[] = [
  'car',
  'injury',
  'property',
  'flight',
] as const;

export const HELP_NOW_COUNTRY_PACKS: readonly HelpNowCountryPack[] = [
  {
    country: 'XK',
    marketLabel: 'Kosovo',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'MK',
    marketLabel: 'North Macedonia',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'AL',
    marketLabel: 'Albania',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'DE',
    marketLabel: 'Germany',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'AT',
    marketLabel: 'Austria',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'HU',
    marketLabel: 'Hungary',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'RS',
    marketLabel: 'Serbia',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'HR',
    marketLabel: 'Croatia',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
  {
    country: 'ME',
    marketLabel: 'Montenegro',
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  },
] as const;

export function hasHelpNowContentLocale(locale: string): locale is HelpNowContentLocale {
  return HELP_NOW_CONTENT_LOCALES.includes(locale as HelpNowContentLocale);
}

export function getHelpNowContentLocale(locale: string): HelpNowContentLocale {
  return hasHelpNowContentLocale(locale) ? locale : 'en';
}

export function getDefaultHelpNowCountry(locale: HelpNowContentLocale): HelpNowCountry {
  if (locale === 'mk') return 'MK';
  if (locale === 'de') return 'DE';
  return 'XK';
}

export function getHelpNowCountryPack(country: HelpNowCountry): HelpNowCountryPack {
  return HELP_NOW_COUNTRY_PACKS.find(pack => pack.country === country) ?? HELP_NOW_COUNTRY_PACKS[0];
}

export function getSignedOffHelpNowPacks() {
  return HELP_NOW_COUNTRY_PACKS.filter(pack => pack.l2SignOff !== null);
}

export function canExposeCountryPack(pack: HelpNowCountryPack): boolean {
  return pack.exposure !== 'dark' && pack.l2SignOff !== null;
}

export function getTripModeDownloadAssets(): readonly string[] {
  return [HELP_NOW_PACK_ASSET];
}
