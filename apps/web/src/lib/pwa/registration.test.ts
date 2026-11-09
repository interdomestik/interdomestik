import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPwaWorker, removeDisabledPwaWorker } from './registration';
import { syncPushSubscription } from './push-subscription';

const preferences = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: true,
  pushClaimUpdates: true,
  pushMessages: true,
  inAppAll: true,
};

describe('shared PWA registration policy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('does not register or request notification permission when disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'false');
    const register = vi.fn();
    const requestPermission = vi.fn();
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    vi.stubGlobal('Notification', { requestPermission });
    await expect(registerPwaWorker()).resolves.toBeUndefined();
    await syncPushSubscription(preferences);
    expect(register).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });
  it('registers the existing root worker and scope when enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'true');
    const postMessage = vi.fn();
    const register = vi.fn().mockResolvedValue({ active: { postMessage } });
    vi.stubGlobal('navigator', { serviceWorker: { register } });
    await registerPwaWorker();
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(postMessage).toHaveBeenCalledWith({ type: 'PURGE_LEGACY_CACHES' });
  });
  it('disabled cleanup preserves other workers and unrelated caches', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'false');
    const owned = { active: { scriptURL: `${location.origin}/sw.js` }, unregister: vi.fn() };
    const other = { active: { scriptURL: `${location.origin}/other/sw.js` }, unregister: vi.fn() };
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: () => Promise.resolve([owned, other]) },
    });
    const remove = vi.fn();
    vi.stubGlobal('caches', {
      keys: () => Promise.resolve(['interdomestik-offline-v1', 'other-cache']),
      delete: remove,
    });
    await removeDisabledPwaWorker();
    expect(owned.unregister).toHaveBeenCalledOnce();
    expect(other.unregister).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledExactlyOnceWith('interdomestik-offline-v1');
  });
  it.each(['granted', 'denied'])(
    'retains notification permission behavior for %s',
    async permission => {
      vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'true');
      vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'AQAB');
      vi.stubGlobal('PushManager', class {});
      const requestPermission = vi.fn().mockResolvedValue(permission);
      vi.stubGlobal('Notification', { requestPermission });
      const subscribe = vi.fn();
      const getSubscription = vi.fn().mockResolvedValue({
        toJSON: () => ({
          endpoint: 'https://push.example/synthetic',
          keys: { p256dh: 'synthetic', auth: 'synthetic' },
        }),
      });
      const register = vi.fn().mockResolvedValue({ pushManager: { getSubscription, subscribe } });
      vi.stubGlobal('navigator', { serviceWorker: { register }, userAgent: 'synthetic' });
      const fetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetch);
      await syncPushSubscription(preferences);
      expect(requestPermission).toHaveBeenCalledOnce();
      expect(register).toHaveBeenCalledTimes(permission === 'granted' ? 1 : 0);
      expect(fetch).toHaveBeenCalledTimes(permission === 'granted' ? 1 : 0);
      expect(subscribe).not.toHaveBeenCalled();
    }
  );

  it('still allows push opt-out while PWA is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_PWA', 'false');
    vi.stubGlobal('PushManager', class {});
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const getRegistration = vi.fn().mockResolvedValue({
      pushManager: {
        getSubscription: () =>
          Promise.resolve({ endpoint: 'https://push.example/synthetic', unsubscribe }),
      },
    });
    vi.stubGlobal('navigator', { serviceWorker: { getRegistration } });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    await syncPushSubscription({ ...preferences, pushClaimUpdates: false, pushMessages: false });
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/api/settings/push',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
