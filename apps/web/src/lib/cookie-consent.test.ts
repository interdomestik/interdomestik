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

  it('fails closed when the two consent stores disagree', () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=necessary`;
    expect(getCookieConsent()).toBe('necessary');
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

  it('treats malformed cookie encoding as absent consent', () => {
    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=%E0%A4%A`;
    expect(getCookieConsent()).toBeNull();
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
      removeItem: available.removeItem.bind(available),
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
    expect(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBeNull();
    expect(getCookieConsent()).toBe('necessary');
  });
  it('keeps the newer cookie authoritative when stale storage is fully read-only', () => {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted');
    const available = localStorage;
    vi.spyOn(window, 'localStorage', 'get').mockReturnValue({
      getItem: available.getItem.bind(available),
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as Storage);
    setCookieConsent('necessary');
    expect(getCookieConsent()).toBe('necessary');
    expect(document.cookie).not.toContain('storage-fallback');
  });

  it('subscribes to consent updates from custom event', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeCookieConsent(handler);

    setCookieConsent('accepted');
    expect(handler).toHaveBeenCalledWith('accepted');

    unsubscribe();
  });
  // prettier-ignore
  it('preserves exact events and broadcasts a storage-fallback decision across tabs', () => { const listeners: Array<(event: { data: unknown }) => void> = [], posted = vi.fn(); class Channel { addEventListener(_type: string, listener: (event: { data: unknown }) => void) { listeners.push(listener); } close() {} postMessage(value: unknown) { posted(value); listeners.forEach(listener => listener({ data: value })); } removeEventListener() {} } vi.stubGlobal('BroadcastChannel', Channel); const handler = vi.fn(), unsubscribe = subscribeCookieConsent(handler); window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, { detail: 'accepted' })); expect(handler).toHaveBeenLastCalledWith('accepted'); localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'accepted'); document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=necessary`; window.dispatchEvent(new StorageEvent('storage', { key: COOKIE_CONSENT_STORAGE_KEY, newValue: 'accepted' })); expect(handler).toHaveBeenLastCalledWith('necessary'); vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked'); }); setCookieConsent('necessary'); expect(posted).toHaveBeenCalledWith('necessary'); expect(handler).toHaveBeenLastCalledWith('necessary'); expect(getCookieConsent()).toBe('necessary'); expect(document.cookie).not.toContain('storage-fallback'); unsubscribe(); });
});
