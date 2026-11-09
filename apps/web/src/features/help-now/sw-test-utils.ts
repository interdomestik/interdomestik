import { onTestFinished, vi } from 'vitest';
import offlineTemplate from '../../../public/offline.html?raw';

export const ORIGIN = 'https://ks.interdomestik.com';
export const PACK = '/help-now-packs/content-packs.v1.json';
export const PACK_CACHE = 'interdomestik-help-now-v2';
export const STATIC_CACHE = 'interdomestik-offline-v2';
export const LEGACY_CACHE = 'interdomestik-help-now-v1';
// Non-literal import specifiers let TypeScript load these classic scripts without exports.
const OFFLINE_HELPER_MODULE = '../../../public/sw-offline.js';
const WORKER_MODULE = '../../../public/sw.js';

type WorkerEvent = {
  request?: Request;
  data?: { type: string };
  origin?: string;
  source?: { url: string };
  ports?: { postMessage: ReturnType<typeof vi.fn> }[];
  respondWith?: (value: Promise<Response>) => void;
  waitUntil?: (value: Promise<unknown>) => void;
};

export function publicResponse(url: string, headers: Record<string, string> = {}, body = 'public') {
  const make = (): Response => {
    const response = new Response(body, { headers });
    Object.defineProperties(response, {
      url: { value: new URL(url, ORIGIN).href },
      type: { value: 'basic', configurable: true },
      clone: { value: make },
    });
    return response;
  };
  return make();
}

export function publicAssetResponse(request: Request): Response {
  let contentType = 'text/html';
  if (request.url.endsWith('.json')) contentType = 'application/json';
  else if (request.url.endsWith('.css')) contentType = 'text/css';
  const pathname = new URL(request.url).pathname;
  const body = pathname === '/offline.html' ? offlineTemplate : 'public';
  return publicResponse(request.url, { 'content-type': contentType }, body);
}

export async function workerHarness() {
  let now = 0;
  const timers = new Set<{ at: number; callback: () => void }>();
  const setTimeout = vi.fn((callback: () => void, milliseconds: number) => {
    timers.add({ at: now + milliseconds, callback });
    return timers.size;
  });
  const advance = (milliseconds: number): void => {
    now += milliseconds;
    [...timers]
      .filter(timer => timer.at <= now)
      .forEach(timer => {
        timers.delete(timer);
        timer.callback();
      });
  };
  const stores = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const key = (request: Request | string): string =>
    new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  const caches = {
    keys: vi.fn(() => Promise.resolve([...stores.keys()])),
    delete: vi.fn((name: string) => Promise.resolve(stores.delete(name))),
    match: vi.fn().mockResolvedValue(new Response('STALE PERSONAL RECORD')),
    open: vi.fn((name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      const put = vi.fn((request: Request | string, response: Response) => {
        store.set(key(request), response.clone());
        return Promise.resolve();
      });
      return Promise.resolve({
        put,
        // A controlled page's addAll fetches traverse the worker; writes are atomic.
        addAll: async (paths: string[]) => {
          const requests = paths.map(pathname => new Request(new URL(pathname, ORIGIN)));
          const responses = await Promise.all(
            requests.map(request => dispatch('fetch', { request }))
          );
          const valid = responses.map(response => {
            if (!response?.ok) throw new TypeError('Cache.addAll failed');
            return response;
          });
          await Promise.all(valid.map((response, index) => put(requests[index], response)));
        },
        match: vi.fn((request: Request | string) =>
          Promise.resolve(store.get(key(request))?.clone())
        ),
      });
    }),
  };
  const fetch = vi.fn((request: Request) => Promise.resolve(publicAssetResponse(request)));
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  onTestFinished(() => {
    vi.unstubAllGlobals();
    clock.mockRestore();
  });
  vi.stubGlobal('caches', caches);
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('setTimeout', setTimeout);
  vi.stubGlobal('location', { origin: ORIGIN });
  vi.stubGlobal('clients', { claim: vi.fn() });
  vi.stubGlobal('skipWaiting', vi.fn());
  vi.stubGlobal('pwaOffline', undefined);
  vi.stubGlobal('importScripts', (url: string) => {
    if (url !== '/sw-offline.js') throw new Error('Unexpected worker dependency');
  });
  vi.stubGlobal('addEventListener', (name: string, listener: (event: WorkerEvent) => void) =>
    listeners.set(name, listener)
  );
  vi.resetModules();
  await import(OFFLINE_HELPER_MODULE);
  await import(WORKER_MODULE);
  function startDispatch(name: string, event: WorkerEvent = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    const listener = listeners.get(name);
    if (!listener) throw new Error('Missing worker listener: ' + name);
    listener({
      ...event,
      waitUntil: promise => pending.push(promise),
      respondWith: promise => {
        response = promise;
      },
    });
    return { response, done: Promise.all(pending) };
  }
  async function dispatch(name: string, event: WorkerEvent = {}) {
    const task = startDispatch(name, event);
    if (name !== 'fetch') await task.done;
    return task.response;
  }
  const request = (url: string, init?: RequestInit): Request =>
    new Request(new URL(url, ORIGIN), init);
  const navigate = (url: string, init?: RequestInit): Request => {
    const value = request(url, init);
    Object.defineProperty(value, 'mode', { value: 'navigate' });
    return value;
  };
  const message = (type: string) =>
    dispatch('message', {
      data: { type },
      origin: ORIGIN,
      source: { url: `${ORIGIN}/en/help-now` },
      ports: [{ postMessage: vi.fn() }],
    });
  return {
    stores,
    caches,
    fetch,
    dispatch,
    startDispatch,
    request,
    navigate,
    message,
    advance,
    setTimeout,
  };
}

// Frozen from 3fd4220ef's offline.ts; runnable after origin/main advances or in shallow CI.
// Controller is present; content-packs.ts supplied this exact v1 cache and one-URL asset list.
export async function runLegacyDownload(
  caches: Awaited<ReturnType<typeof workerHarness>>['caches'] | undefined,
  pathname: string
): Promise<'saved' | 'unsupported' | 'failed'> {
  if (caches === undefined) return 'unsupported';
  if (!/^\/(sq|en|sr|mk|de|hr)\/help-now\/?$/.test(pathname)) return 'unsupported';
  try {
    const cache = await caches.open(LEGACY_CACHE);
    await cache.addAll([PACK, pathname]);
    return 'saved';
  } catch {
    return 'failed';
  }
}

export async function downloadedOfflineDocument(locale: string) {
  const worker = await workerHarness();
  await worker.message('CACHE_HELP_NOW_PACK');
  worker.fetch.mockRejectedValue(new Error('offline'));
  const response = await worker.dispatch('fetch', {
    request: worker.navigate(`/${locale}/help-now`),
  });
  if (!response) throw new Error('Missing offline response');
  return { worker, response };
}
