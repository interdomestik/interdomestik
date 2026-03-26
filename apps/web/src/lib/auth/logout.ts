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
  const replace = replaceLocation ?? ((href: string) => globalThis.location.replace(href));
  replace(`/${safeLocale}/login`);
}

function isExpectedSignOutRedirectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name === 'AbortError') {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes('failed to fetch') || message.includes('networkerror');
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
  try {
    await signOut();
  } catch (error) {
    // Client-side logout can reject after the auth cookie is already cleared if
    // navigation interrupts the fetch pipeline. Treat that as a successful logout.
    if (!isExpectedSignOutRedirectError(error)) {
      throw error;
    }
  }

  redirectToLocalizedLogin(locale, replaceLocation);
}
