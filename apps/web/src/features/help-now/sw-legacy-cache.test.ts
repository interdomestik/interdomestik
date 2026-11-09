import { describe, expect, it } from 'vitest';
import {
  ORIGIN,
  PACK,
  PACK_CACHE,
  STATIC_CACHE,
  publicAssetResponse,
  publicResponse,
  workerHarness,
} from './sw-test-harness';

describe('legacy tabs with a hardened worker', () => {
  it('removes a cache recreated by the origin/main addAll writer on the next navigation', async () => {
    const h = workerHarness();
    await h.dispatch('activate');
    h.fetch.mockImplementation(request =>
      Promise.resolve(
        request.url.endsWith('/en/help-now')
          ? publicResponse('/en/help-now', {}, 'SYNTHETIC PRIVATE RECORD')
          : publicAssetResponse(request)
      )
    );
    // Model the old page-side helper: Cache.addAll still runs in already-loaded tabs.
    const legacy = await h.caches.open('interdomestik-help-now-v1');
    const saved = await legacy.addAll([PACK, '/en/help-now']).then(() => 'saved');
    expect(saved).toBe('saved');
    expect(await (await legacy.match(`${ORIGIN}/en/help-now`))?.text()).toContain('PRIVATE');
    h.caches.open.mockClear();
    h.fetch.mockRejectedValue(new Error('offline'));
    const response = await h.dispatch('fetch', { request: h.navigate('/en/help-now') });
    expect(response?.status).toBe(503);
    expect(await response?.text()).not.toContain('PRIVATE');
    expect(h.stores.has('interdomestik-help-now-v1')).toBe(false);
    expect(h.caches.match).not.toHaveBeenCalled();
    expect(
      h.caches.open.mock.calls.every(([name]) => [PACK_CACHE, STATIC_CACHE].includes(name))
    ).toBe(true);
  });

  it('coalesces navigation/message sweeps and removes later legacy writes after five seconds', async () => {
    const h = workerHarness();
    await h.caches.open('legacy');
    await h.message('PURGE_LEGACY_CACHES');
    expect(h.stores.has('legacy')).toBe(false);
    const legacy = await h.caches.open('legacy');
    await legacy.put(
      h.request(PACK),
      publicResponse(PACK, { 'content-type': 'application/json' }, 'PRIVATE')
    );
    h.fetch.mockRejectedValue(new Error('offline'));
    h.caches.open.mockClear();
    const pack = await h.dispatch('fetch', { request: h.request(PACK) });
    expect(pack?.status).toBe(503);
    expect(await pack?.text()).not.toContain('PRIVATE');
    expect(h.caches.open.mock.calls.some(([name]) => name === 'legacy')).toBe(false);
    await Promise.all([
      h.dispatch('fetch', { request: h.navigate('/en/member') }),
      h.message('PURGE_LEGACY_CACHES'),
    ]);
    expect(h.caches.keys).toHaveBeenCalledTimes(1);
    h.advance(5000);
    await h.dispatch('fetch', { request: h.navigate('/sq/admin') });
    expect(h.caches.keys).toHaveBeenCalledTimes(2);
    expect(h.stores.has('legacy')).toBe(false);
  });
});
