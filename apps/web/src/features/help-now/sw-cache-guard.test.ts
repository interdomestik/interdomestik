import { describe, expect, it, vi } from 'vitest';
import {
  ORIGIN,
  PACK,
  PACK_CACHE,
  STATIC_CACHE,
  publicResponse,
  publicAssetResponse,
  workerHarness,
} from './sw-test-utils';

const HELP_NOW_PATH = '/en/help-now';
const MEMBER_PATH = '/en/member';

describe('PWA cache privacy policy', () => {
  it('keeps protected and data requests network-only and public assets cache-readable', async () => {
    const h = await workerHarness();
    await h.message('CACHE_HELP_NOW_PACK');
    h.fetch.mockRejectedValue(new Error('offline'));
    h.caches.open.mockClear();
    for (const path of [
      '/member',
      '/agent/a',
      '/staff',
      '/admin',
      '/api/data',
      '/en/member/a',
      '/sq/agent',
      '/mk/staff',
      '/sr/admin',
      '/de/member',
      '/hr/admin',
      HELP_NOW_PATH,
      '/_next/data/build/a.json',
      '/_next/static/a.js',
      '/document.pdf',
      `${PACK}?signed=token`,
    ]) {
      const response = await h.dispatch('fetch', { request: h.request(path) });
      // A legacy HTML download is rejected before the ordinary network-only path.
      expect(response?.status, path).toBe(path === HELP_NOW_PATH ? 0 : 503);
    }
    for (const request of [
      h.request(PACK, { headers: { RSC: '1' } }),
      h.request(PACK, { headers: { Authorization: 'Bearer synthetic' } }),
      h.request(`https://mk.interdomestik.com${PACK}`),
    ]) {
      expect((await h.dispatch('fetch', { request }))?.status).toBe(503);
    }
    expect(h.caches.open).not.toHaveBeenCalled();
    expect(h.caches.match).not.toHaveBeenCalled();
    for (const [path, cache] of [
      [PACK, PACK_CACHE],
      ['/offline.html', STATIC_CACHE],
    ]) {
      expect((await h.dispatch('fetch', { request: h.request(path) }))?.status).toBe(200);
      expect(h.caches.open).toHaveBeenLastCalledWith(cache);
    }
  });

  it('never reads planted protected entries in any cache, even on navigation failure', async () => {
    const h = await workerHarness();
    await Promise.all(
      ['legacy', PACK_CACHE, STATIC_CACHE].map(async name => {
        const cache = await h.caches.open(name);
        await Promise.all(
          [MEMBER_PATH, '/api/data', '/sq/admin'].map(path =>
            cache.put(h.request(path), publicResponse(path, {}, 'PERSONAL RECORD'))
          )
        );
      })
    );
    h.caches.open.mockClear();
    h.fetch.mockRejectedValue(new Error('offline'));
    await Promise.all(
      [MEMBER_PATH, '/sq/admin', '/api/data'].map(async path => {
        const response = await h.dispatch('fetch', { request: h.navigate(path) });
        expect(response?.status).toBe(503);
        expect(await response?.text()).not.toContain('PERSONAL');
      })
    );
    expect(h.caches.open).not.toHaveBeenCalled();
    expect(h.caches.match).not.toHaveBeenCalled();
  });

  it('upgrades by deleting every cache outside the current allowlist', async () => {
    const h = await workerHarness();
    await Promise.all(
      ['interdomestik-help-now-v1', 'unowned-legacy', PACK_CACHE, STATIC_CACHE].map(name =>
        h.caches.open(name)
      )
    );
    await h.dispatch('activate');
    expect(new Set(h.stores.keys())).toEqual(new Set([PACK_CACHE, STATIC_CACHE]));
  });

  it('downloads only reviewed public assets without credentials, headers or redirects', async () => {
    const h = await workerHarness();
    await h.message('CACHE_HELP_NOW_PACK');
    expect(h.stores.get(PACK_CACHE)?.has(`${ORIGIN}${PACK}`)).toBe(true);
    for (const [request] of h.fetch.mock.calls) {
      expect(request.credentials).toBe('omit');
      expect(request.redirect).toBe('error');
      expect(request.cache).toBe('no-store');
      expect([...request.headers]).toEqual([]);
      expect(new URL(request.url).pathname).not.toMatch(/member|api/);
    }
  });

  it('ignores a foreign message origin even with a same-origin source URL', async () => {
    const h = await workerHarness();
    const postMessage = vi.fn();
    await h.dispatch('message', {
      data: { type: 'CACHE_HELP_NOW_PACK' },
      origin: 'https://foreign.example',
      source: { url: `${ORIGIN}/en/help-now` },
      ports: [{ postMessage }],
    });
    expect(h.caches.open).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  const unsafeHeaders: Record<string, string>[] = [
    { 'cache-control': 'private' },
    { 'cache-control': 'no-store' },
    { 'set-cookie': 'synthetic=value' },
    { vary: 'Cookie' },
    { 'content-type': 'text/x-component' },
  ];
  it.each(unsafeHeaders)('rejects unsafe responses on writes and reads: %j', async headers => {
    const h = await workerHarness();
    h.fetch.mockImplementation(request =>
      Promise.resolve(
        publicResponse(request.url, {
          ...Object.fromEntries(publicAssetResponse(request).headers),
          ...headers,
        })
      )
    );
    await h.message('CACHE_HELP_NOW_PACK');
    expect(h.stores.get(PACK_CACHE)?.size ?? 0).toBe(0);
    const cache = await h.caches.open(PACK_CACHE);
    await cache.put(
      h.request(PACK),
      publicResponse(PACK, { 'content-type': 'application/json', ...headers }, 'PERSONAL')
    );
    h.fetch.mockRejectedValue(new Error('offline'));
    const response = await h.dispatch('fetch', { request: h.request(PACK) });
    expect(response?.status).toBe(503);
  });

  it('never caches runtime Help Now HTML, and distinguishes fresh versus downloaded offline packs', async () => {
    const h = await workerHarness();
    h.fetch.mockRejectedValue(new Error('offline'));
    let response = await h.dispatch('fetch', { request: h.navigate(HELP_NOW_PATH) });
    expect(response?.status).toBe(503);
    h.fetch.mockImplementation(request => Promise.resolve(publicAssetResponse(request)));
    await h.message('CACHE_HELP_NOW_PACK');
    h.fetch.mockRejectedValue(new Error('offline'));
    response = await h.dispatch('fetch', { request: h.navigate(HELP_NOW_PATH) });
    expect(response?.status).toBe(200);
    expect([...(h.stores.get(PACK_CACHE)?.keys() ?? [])]).toEqual([`${ORIGIN}${PACK}`]);
  });

  it.each(['redirect', 'wrong-url', 'opaque'])('rejects %s public responses', async kind => {
    const h = await workerHarness();
    h.fetch.mockImplementation(request => {
      const response = publicResponse(
        kind === 'wrong-url' ? MEMBER_PATH : request.url,
        Object.fromEntries(publicAssetResponse(request).headers)
      );
      if (kind !== 'wrong-url')
        Object.defineProperty(response, kind === 'redirect' ? 'redirected' : 'type', {
          value: kind === 'redirect' ? true : 'opaque',
        });
      return Promise.resolve(response);
    });
    await h.message('CACHE_HELP_NOW_PACK');
    expect(h.stores.size).toBe(0);
  });

  it('uses no Cache Storage for online workspace, API, RSC, signed URLs or mutations', async () => {
    const h = await workerHarness();
    await Promise.all(
      [
        h.navigate(MEMBER_PATH),
        h.request('/api/data'),
        h.request('/en/help-now?_rsc=synthetic'),
        h.request('/document?signature=synthetic'),
        h.request('/api/mutation', { method: 'POST', body: 'synthetic' }),
      ].map(async request => {
        const response = await h.dispatch('fetch', { request });
        expect(response?.status).toBe(200);
      })
    );
    expect(h.caches.keys).toHaveBeenCalledTimes(1);
    expect(h.caches.open).not.toHaveBeenCalled();
    expect(h.caches.match).not.toHaveBeenCalled();
  });

  it('does not fall back to a stale public pack after a live private response', async () => {
    const h = await workerHarness();
    await h.message('CACHE_HELP_NOW_PACK');
    h.caches.open.mockClear();
    h.fetch.mockResolvedValue(publicResponse(PACK, { 'cache-control': 'private' }, 'network only'));
    const response = await h.dispatch('fetch', { request: h.request(PACK) });
    expect(await response?.text()).toBe('network only');
    expect(h.caches.open).not.toHaveBeenCalled();
  });
});
