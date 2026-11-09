import { describe, expect, it } from 'vitest';
import { PACK, workerHarness } from './sw-test-harness';

const exclusions: RequestInit[] = [
  ...[
    'RSC',
    'Next-Router-State-Tree',
    'Next-Router-Prefetch',
    'Next-Url',
    'Next-Action',
    'Authorization',
    'Cookie',
    'Range',
  ].map(header => ({ headers: { [header]: 'synthetic' } })),
  { cache: 'no-store' },
  { method: 'POST' },
  { headers: { 'Cache-Control': 'private' } },
  { headers: { Accept: 'text/x-component' } },
];

describe('consistent network-only exclusions', () => {
  it.each(exclusions)('blocks pack and navigation cache reads for %j', async init => {
    const h = workerHarness();
    await h.message('CACHE_HELP_NOW_PACK');
    h.fetch.mockRejectedValue(new Error('offline'));
    h.caches.open.mockClear();
    const responses = await Promise.all([
      h.dispatch('fetch', { request: h.request(PACK, init) }),
      h.dispatch('fetch', { request: h.navigate('/sq/help-now', init) }),
    ]);
    expect(responses.map(response => response?.status)).toEqual([503, 503]);
    expect(h.caches.open).not.toHaveBeenCalled();
    expect(h.caches.match).not.toHaveBeenCalled();
  });
  it('rejects Flight query, protected and foreign-host fallbacks', async () => {
    const h = workerHarness();
    await h.message('CACHE_HELP_NOW_PACK');
    h.fetch.mockRejectedValue(new Error('offline'));
    h.caches.open.mockClear();
    const paths = [
      '/en/help-now?_rsc=synthetic',
      `${PACK}?_rsc=synthetic`,
      '/en/member',
      '/api/data',
      'https://mk.interdomestik.com/en/help-now',
    ];
    const responses = await Promise.all(
      paths.map(path => h.dispatch('fetch', { request: h.navigate(path) }))
    );
    expect(responses.every(response => response?.status === 503)).toBe(true);
    expect(h.caches.open).not.toHaveBeenCalled();
  });
});
