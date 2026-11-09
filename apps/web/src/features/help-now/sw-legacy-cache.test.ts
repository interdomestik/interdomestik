import { describe, expect, it } from 'vitest';
import {
  LEGACY_CACHE,
  ORIGIN,
  PACK,
  publicAssetResponse,
  publicResponse,
  runLegacyDownload,
  workerHarness,
} from './sw-test-utils';

describe('legacy tabs with a hardened worker', () => {
  it.each(['en', 'sq', 'mk', 'sr', 'de', 'hr', 'en/'])(
    'rejects the real origin/main writer for %s without retaining private entries',
    async locale => {
      const h = await workerHarness();
      await h.dispatch('activate');
      const route = locale.endsWith('/') ? '/en/help-now/' : `/${locale}/help-now`;
      h.fetch.mockImplementation(request =>
        Promise.resolve(
          request.url.includes('/help-now') && !request.url.includes('/help-now-packs/')
            ? publicResponse(request.url, {}, 'SYNTHETIC PRIVATE RECORD')
            : publicAssetResponse(request)
        )
      );
      expect(await runLegacyDownload(h.caches, route)).toBe('failed');
      expect(h.stores.has(LEGACY_CACHE)).toBe(false);
      expect(h.stores.size).toBe(0);
      expect(h.fetch.mock.calls.some(([request]) => new URL(request.url).pathname === route)).toBe(
        false
      );
      // No subsequent navigation or message is needed to prevent the private write.
      h.advance(60000);
      await h.dispatch('fetch', { request: h.request(PACK) });
      expect(h.stores.size).toBe(0);
      expect(h.caches.match).not.toHaveBeenCalled();
    }
  );

  it('schedules one deferred sweep for throttle-window navigation and messages', async () => {
    const h = await workerHarness();
    await h.message('PURGE_LEGACY_CACHES');
    const legacy = await h.caches.open(LEGACY_CACHE);
    await legacy.put(h.request(PACK), publicResponse(PACK, {}, 'PRIVATE'));
    h.fetch.mockRejectedValue(new Error('offline'));
    h.caches.open.mockClear();
    const pack = await h.dispatch('fetch', { request: h.request(PACK) });
    expect(pack?.status).toBe(503);
    expect(await pack?.text()).not.toContain('PRIVATE');
    expect(h.caches.open.mock.calls.some(([name]) => name === LEGACY_CACHE)).toBe(false);
    const navigation = h.startDispatch('fetch', { request: h.navigate('/en/member') });
    const message = h.startDispatch('message', {
      data: { type: 'PURGE_LEGACY_CACHES' },
      origin: ORIGIN,
      source: { url: ORIGIN },
    });
    expect((await navigation.response)?.status).toBe(503);
    expect(h.setTimeout).toHaveBeenCalledTimes(1);
    h.advance(4999);
    expect(h.caches.keys).toHaveBeenCalledTimes(1);
    h.advance(1);
    await Promise.all([navigation.done, message.done]);
    expect(h.caches.keys).toHaveBeenCalledTimes(2);
    expect(h.stores.has(LEGACY_CACHE)).toBe(false);
    h.advance(60000);
    expect(h.caches.keys).toHaveBeenCalledTimes(2);
  });
});
