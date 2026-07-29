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
    vi.restoreAllMocks();
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

  it('preserves the existing successful localStorage precedence', () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=necessary`;
    expect(getCookieConsent()).toBe('accepted');
  });

  it('falls back to the cookie when the storage accessor is denied', () => {
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=accepted`;
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(getCookieConsent()).toBe('accepted');
  });

  it('falls back to the cookie when storage reads throw', () => {
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=necessary`;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as Storage);

    expect(getCookieConsent()).toBe('necessary');
  });

  it('persists consent and emits update event', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    setCookieConsent('necessary');

    expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe('necessary');
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=necessary`);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('keeps cookie and event behavior when the storage accessor is denied', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(() => setCookieConsent('accepted')).not.toThrow();
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=accepted`);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      type: COOKIE_CONSENT_UPDATED_EVENT,
      detail: 'accepted',
    });
  });

  it('keeps cookie and event behavior when storage writes throw', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');
    const available = localStorage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: available.getItem.bind(available),
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as Storage);

    expect(() => setCookieConsent('necessary')).not.toThrow();
    expect(document.cookie).toContain(`${COOKIE_CONSENT_COOKIE_NAME}=necessary`);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({
      type: COOKIE_CONSENT_UPDATED_EVENT,
      detail: 'necessary',
    });
    expect(getCookieConsent()).toBe('accepted');
  });

  it('subscribes to consent updates from custom event', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeCookieConsent(handler);

    setCookieConsent('accepted');
    expect(handler).toHaveBeenCalledWith('accepted');

    unsubscribe();
  });
  // prettier-ignore
  it('preserves exact custom-event detail and storage-event newValue handling', () => { localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'necessary'); const handler = vi.fn(), unsubscribe = subscribeCookieConsent(handler); window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, { detail: 'accepted' })); expect(handler).toHaveBeenLastCalledWith('accepted'); window.dispatchEvent(new StorageEvent('storage', { key: COOKIE_CONSENT_STORAGE_KEY, newValue: 'accepted' })); expect(handler).toHaveBeenLastCalledWith('accepted'); unsubscribe(); });
});
