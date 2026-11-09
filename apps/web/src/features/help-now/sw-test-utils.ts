import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import ts from 'typescript';

export const ORIGIN = 'https://ks.interdomestik.com';
export const PACK = '/help-now-packs/content-packs.v1.json';
export const PACK_CACHE = 'interdomestik-help-now-v2';
export const STATIC_CACHE = 'interdomestik-offline-v2';
export const LEGACY_CACHE = 'interdomestik-help-now-v1';
const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public');
const source = fs.readFileSync(path.join(publicRoot, 'sw.js'), 'utf8');

// Frozen from 3fd4220ef's offline.ts; runnable after origin/main advances or in shallow CI.
const LEGACY_DOWNLOAD_SOURCE = String.raw`import { getTripModeDownloadAssets, HELP_NOW_CACHE_NAME } from './content-packs';

export type OfflineSaveResult = 'saved' | 'unsupported' | 'failed';
const HELP_NOW_PUBLIC_ROUTE = /^\/(sq|en|sr|mk|de|hr)\/help-now\/?$/;

function hasServiceWorkerController(): boolean {
  return globalThis.navigator?.serviceWorker?.controller != null;
}

function getCurrentHelpNowRoute(): string | null {
  const pathname = globalThis.location?.pathname ?? '';
  return HELP_NOW_PUBLIC_ROUTE.test(pathname) ? pathname : null;
}

export async function saveTripModePackForOffline(): Promise<OfflineSaveResult> {
  if (globalThis.caches === undefined) return 'unsupported';
  if (!hasServiceWorkerController()) return 'unsupported';
  const route = getCurrentHelpNowRoute();
  if (!route) return 'unsupported';

  try {
    const cache = await globalThis.caches.open(HELP_NOW_CACHE_NAME);
    await cache.addAll([...getTripModeDownloadAssets(), route]);
    return 'saved';
  } catch {
    return 'failed';
  }
}
`;

type WorkerEvent = {
  request?: Request;
  data?: { type: string };
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
  const body =
    pathname === '/offline.html'
      ? fs.readFileSync(path.join(publicRoot, 'offline.html'), 'utf8')
      : 'public';
  return publicResponse(request.url, { 'content-type': contentType }, body);
}

export function workerHarness() {
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
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
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
          if (responses.some(response => !response?.ok)) throw new TypeError('Cache.addAll failed');
          await Promise.all(requests.map((request, index) => put(request, responses[index]!)));
        },
        match: vi.fn((request: Request | string) =>
          Promise.resolve(store.get(key(request))?.clone())
        ),
      });
    }),
  };
  const fetch = vi.fn((request: Request) => Promise.resolve(publicAssetResponse(request)));
  const context = vm.createContext({
    importScripts: (url: string) => {
      if (url !== '/sw-offline.js') throw new Error('Unexpected worker dependency');
      const helper = fs.readFileSync(path.join(publicRoot, 'sw-offline.js'), 'utf8');
      vm.runInContext(helper, context);
    },
    URL,
    Request,
    Response,
    Headers,
    Date: { now: () => now },
    setTimeout,
    caches,
    fetch,
    location: { origin: ORIGIN },
    clients: { claim: vi.fn() },
    skipWaiting: vi.fn(),
    addEventListener: (name: string, listener: (event: WorkerEvent) => void) =>
      listeners.set(name, listener),
  });
  vm.runInContext(source, context);
  function startDispatch(name: string, event: WorkerEvent = {}) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(name)!({
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
    context,
    advance,
    setTimeout,
  };
}

export function runLegacyDownload(worker: ReturnType<typeof workerHarness>, pathname: string) {
  const { outputText } = ts.transpileModule(LEGACY_DOWNLOAD_SOURCE, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (dependency: string) => {
      if (dependency !== './content-packs') throw new Error('Unexpected legacy dependency');
      // The base content-packs.ts exports this exact cache name and one-URL asset list.
      return { HELP_NOW_CACHE_NAME: LEGACY_CACHE, getTripModeDownloadAssets: () => [PACK] };
    },
    caches: worker.caches,
    navigator: { serviceWorker: { controller: {} } },
    location: { pathname },
  });
  const save = exports.saveTripModePackForOffline as () => Promise<
    'saved' | 'unsupported' | 'failed'
  >;
  return save();
}

export async function downloadedOfflineDocument(locale: string) {
  const worker = workerHarness();
  await worker.message('CACHE_HELP_NOW_PACK');
  worker.fetch.mockRejectedValue(new Error('offline'));
  const response = await worker.dispatch('fetch', {
    request: worker.navigate(`/${locale}/help-now`),
  });
  if (!response) throw new Error('Missing offline response');
  return { worker, response };
}
