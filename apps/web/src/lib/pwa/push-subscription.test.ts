import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncPushSubscription } from './push-subscription';

const optOut = {
  emailClaimUpdates: true,
  emailMarketing: false,
  emailNewsletter: true,
  pushClaimUpdates: false,
  pushMessages: false,
  inAppAll: true,
};

describe('independent push opt-out cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    'delete-rejects',
    'delete-non-ok',
    'unsubscribe-false',
    'unsubscribe-rejects',
    'success',
  ])('attempts both cleanups and reports %s', async failure => {
    const unsubscribe = vi.fn().mockResolvedValue(failure !== 'unsubscribe-false');
    if (failure === 'unsubscribe-rejects')
      unsubscribe.mockRejectedValue(new Error('browser denied'));
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistration: () =>
          Promise.resolve({
            pushManager: {
              getSubscription: () =>
                Promise.resolve({ endpoint: 'https://push.example/synthetic', unsubscribe }),
            },
          }),
      },
    });
    const fetch = vi.fn().mockResolvedValue({ ok: failure !== 'delete-non-ok' });
    if (failure === 'delete-rejects') fetch.mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const result = await syncPushSubscription(optOut);
    expect(fetch).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(result).toEqual(
      failure === 'success' ? { ok: true } : { ok: false, reason: 'push-sync-failed' }
    );
  });
});
