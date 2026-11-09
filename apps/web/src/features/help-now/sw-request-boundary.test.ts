import vm from 'node:vm';
import { FLIGHT_HEADERS } from 'next/dist/client/components/app-router-headers';
import { describe, expect, it } from 'vitest';
import { PACK, workerHarness } from './sw-test-harness';

const exclusions: RequestInit[] = [
  ...[...FLIGHT_HEADERS, 'Next-Url', 'Next-Action', 'Authorization', 'Cookie', 'Range'].map(
    header => ({ headers: { [header]: 'synthetic' } })
  ),
  { cache: 'no-store' },
  { method: 'POST' },
  { headers: { 'Cache-Control': 'private' } },
  { headers: { Accept: 'text/x-component' } },
];

describe('consistent network-only exclusions', () => {
  it('mirrors the installed Next Flight header list', () => {
    expect(vm.runInContext('FLIGHT_HEADERS', workerHarness().context)).toEqual(FLIGHT_HEADERS);
  });
  it.each([
    ...FLIGHT_HEADERS.map(header => ({ headers: { [header]: 'synthetic' } })),
    { headers: { 'Next-Url': '/en/help-now' } },
    { headers: { 'Next-Action': 'synthetic' } },
    { headers: { Accept: 'text/x-component' } },
  ])('forwards legitimate Flight requests with %j to the network', async init => {
    const h = workerHarness();
    const request = h.request('/en/help-now', init);
    expect((await h.dispatch('fetch', { request }))?.status).toBe(200);
    expect(h.fetch).toHaveBeenCalledWith(request, { cache: 'no-store' });
    expect(h.caches.open).not.toHaveBeenCalled();
  });
  it('preserves navigation, Flight query, pack JSON and static asset requests', async () => {
    const h = workerHarness();
    const requests = [
      h.navigate('/en/help-now'),
      h.request('/en/help-now?_rsc=synthetic'),
      h.request(PACK),
      h.request('/offline.css'),
    ];
    const responses = await Promise.all(requests.map(request => h.dispatch('fetch', { request })));
    expect(responses.map(response => response?.status)).toEqual([200, 200, 200, 200]);
    expect(h.fetch).toHaveBeenCalledTimes(requests.length);
    expect(h.caches.open).not.toHaveBeenCalled();
  });
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
