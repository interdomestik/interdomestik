export const HELP_NOW_CACHE_NAME = 'interdomestik-help-now-v1';
export const HELP_NOW_PACK_ASSET = '/help-now-packs/content-packs.v1.json';

export const HELP_NOW_CONTENT_LOCALES = ['en', 'sq', 'mk', 'sr'] as const;
export type HelpNowContentLocale = (typeof HELP_NOW_CONTENT_LOCALES)[number];
export type HelpNowScenario = 'car' | 'injury' | 'property' | 'flight';
const HELP_NOW_COUNTRY_LABELS = {
  XK: 'Kosovo',
  MK: 'North Macedonia',
  AL: 'Albania',
  DE: 'Germany',
  AT: 'Austria',
  HU: 'Hungary',
  RS: 'Serbia',
  HR: 'Croatia',
  ME: 'Montenegro',
} as const;

export type HelpNowCountry = keyof typeof HELP_NOW_COUNTRY_LABELS;

export type HelpNowCountryPack = {
  country: HelpNowCountry;
  marketLabel: string;
  exposure: 'dark' | 'public';
  l2SignOff: { reviewer: string; date: string; packHash: string } | null;
  reviewStatus: 'not_started';
};

export const HELP_NOW_SCENARIOS: readonly HelpNowScenario[] = [
  'car',
  'injury',
  'property',
  'flight',
] as const;

function createDarkCountryPack(country: HelpNowCountry): HelpNowCountryPack {
  return {
    country,
    marketLabel: HELP_NOW_COUNTRY_LABELS[country],
    exposure: 'dark',
    l2SignOff: null,
    reviewStatus: 'not_started',
  };
}

export const HELP_NOW_COUNTRY_PACKS: readonly HelpNowCountryPack[] = (
  Object.keys(HELP_NOW_COUNTRY_LABELS) as HelpNowCountry[]
).map(createDarkCountryPack);

export function hasHelpNowContentLocale(locale: string): locale is HelpNowContentLocale {
  return HELP_NOW_CONTENT_LOCALES.includes(locale as HelpNowContentLocale);
}

export function getHelpNowContentLocale(locale: string): HelpNowContentLocale {
  return hasHelpNowContentLocale(locale) ? locale : 'en';
}

export function getDefaultHelpNowCountry(locale: HelpNowContentLocale): HelpNowCountry {
  if (locale === 'mk') return 'MK';
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
