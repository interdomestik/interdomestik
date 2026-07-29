import { useEffect, useState } from 'react';

export const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';
export const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';
export const COOKIE_CONSENT_UPDATED_EVENT = 'interdomestik:cookie-consent-updated';

export type CookieConsentValue = 'accepted' | 'necessary';

const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const COOKIE_CONSENT_FALLBACK_SUFFIX = ':storage-fallback';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const match = document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));

  if (!match) return null;

  const [, rawValue = ''] = match.split('=');
  if (!rawValue) return null;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return null;
  }
}

export function parseCookieConsentValue(
  value: string | null | undefined
): CookieConsentValue | null {
  if (value === 'accepted' || value === 'necessary') return value;
  return null;
}

export function getCookieConsent(): CookieConsentValue | null {
  if (!isBrowser()) return null;

  const cookieValue = getCookieValue(COOKIE_CONSENT_COOKIE_NAME);
  if (cookieValue?.endsWith(COOKIE_CONSENT_FALLBACK_SUFFIX)) {
    return parseCookieConsentValue(cookieValue.slice(0, -COOKIE_CONSENT_FALLBACK_SUFFIX.length));
  }
  let storageValue: CookieConsentValue | null = null;
  try {
    storageValue = parseCookieConsentValue(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    // Browser policy may deny the storage accessor or read; the existing cookie is the fallback.
  }

  if (storageValue) return storageValue;
  return parseCookieConsentValue(cookieValue);
}

export function setCookieConsent(value: CookieConsentValue): void {
  if (!isBrowser()) return;

  let storageFallback = false;
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, value);
  } catch {
    storageFallback = true;
    // Remove a readable stale choice before falling back to the newer cookie.
    try {
      localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
    } catch {}
  }
  const cookieValue = storageFallback ? `${value}${COOKIE_CONSENT_FALLBACK_SUFFIX}` : value;
  document.cookie =
    `${COOKIE_CONSENT_COOKIE_NAME}=${encodeURIComponent(cookieValue)}; ` +
    `Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
  window.dispatchEvent(
    new CustomEvent<CookieConsentValue>(COOKIE_CONSENT_UPDATED_EVENT, {
      detail: value,
    })
  );
}

export function subscribeCookieConsent(
  onChange: (value: CookieConsentValue | null) => void
): () => void {
  if (!isBrowser()) return () => undefined;

  const handleCustomUpdate = (event: Event) => {
    const detail = (event as CustomEvent<CookieConsentValue>).detail;
    onChange(parseCookieConsentValue(detail));
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== COOKIE_CONSENT_STORAGE_KEY) return;
    onChange(parseCookieConsentValue(event.newValue));
  };

  window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, handleCustomUpdate as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, handleCustomUpdate as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
}

export function useCookieConsent(): {
  consent: CookieConsentValue | null;
  ready: boolean;
} {
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setConsent(getCookieConsent());
    setReady(true);

    return subscribeCookieConsent(nextValue => {
      setConsent(nextValue);
    });
  }, []);

  return { consent, ready };
}
