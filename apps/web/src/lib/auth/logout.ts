import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/locales';

type ReplaceLocation = (href: string) => void;

type SignOutFn = () => Promise<unknown>;

function isSupportedLocale(locale: string): locale is AppLocale {
  return LOCALES.includes(locale as AppLocale);
}

function normalizeLocale(locale: string): AppLocale {
  const normalized = locale.trim().toLowerCase();
  return isSupportedLocale(normalized) ? normalized : DEFAULT_LOCALE;
}

export function redirectToLocalizedLogin(locale: string, replaceLocation?: ReplaceLocation): void {
  const safeLocale = normalizeLocale(locale);
  const replace = replaceLocation ?? ((href: string) => window.location.replace(href));
  replace(`/${safeLocale}/login`);
}

export async function signOutAndRedirectToLogin({
  locale,
  signOut,
  replaceLocation,
}: {
  locale: string;
  signOut: SignOutFn;
  replaceLocation?: ReplaceLocation;
}): Promise<void> {
  await signOut();
  redirectToLocalizedLogin(locale, replaceLocation);
}
