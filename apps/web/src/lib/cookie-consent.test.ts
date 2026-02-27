import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_UPDATED_EVENT,
  getCookieConsent,
  parseCookieConsentValue,
  setCookieConsent,
  subscribeCookieConsent,
} from './cookie-consent';

function resetCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; path=/`;
}

describe('cookie consent helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCookie(COOKIE_CONSENT_COOKIE_NAME);
  });

  afterEach(() => {
    localStorage.clear();
    resetCookie(COOKIE_CONSENT_COOKIE_NAME);
  });

  it('parses only supported consent values', () => {
    expect(parseCookieConsentValue('accepted')).toBe('accepted');
    expect(parseCookieConsentValue('necessary')).toBe('necessary');
    expect(parseCookieConsentValue('')).toBeNull();
    expect(parseCookieConsentValue('declined')).toBeNull();
    expect(parseCookieConsentValue(null)).toBeNull();
  });

  it('reads consent from localStorage', () => {
    expect(getCookieConsent()).toBeNull();

    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');
    expect(getCookieConsent()).toBe('accepted');
  });

  it('persists consent and emits update event', () => {
    const listener = vi.fn();
    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, listener);

    setCookieConsent('necessary');

    expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('necessary');
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=necessary`);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribes to consent updates from custom event', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeCookieConsent(handler);

    setCookieConsent('accepted');
    expect(handler).toHaveBeenCalledWith('accepted');

    unsubscribe();
  });
});
