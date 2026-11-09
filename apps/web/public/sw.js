// Only these reviewed, credential-free public resources may enter Cache Storage.
globalThis.importScripts('/sw-offline.js');
const CACHE_NAME = 'interdomestik-offline-v2';
const HELP_NOW_CACHE_NAME = 'interdomestik-help-now-v2';
const CURRENT_CACHES = new Set([CACHE_NAME, HELP_NOW_CACHE_NAME]);
const PACK_URL = '/help-now-packs/content-packs.v1.json';
const STATIC_ASSETS = new Map([
  ['/offline.html', 'text/html'],
  ['/offline.css', 'text/css'],
]);
const HELP_NOW_PUBLIC_ROUTE = /^\/(sq|en|sr|mk|de|hr)\/help-now\/?$/;
function canReadPublicCache(request) {
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== globalThis.location.origin ||
    url.search ||
    request.cache === 'no-store' ||
    /private|no-store/i.test(request.headers.get('cache-control') || '') ||
    /text\/x-component/i.test(request.headers.get('accept') || '') ||
    [
      'authorization',
      'cookie',
      'range',
      'rsc',
      'next-router-state-tree',
      'next-router-prefetch',
      'next-url',
      'next-action',
    ].some(header => request.headers.has(header))
  )
    return false;
  return (
    url.pathname === PACK_URL ||
    STATIC_ASSETS.has(url.pathname) ||
    HELP_NOW_PUBLIC_ROUTE.test(url.pathname)
  );
}

function classifyRequest(request) {
  if (!canReadPublicCache(request)) return 'network';
  const url = new URL(request.url);
  if (url.pathname === PACK_URL) return 'pack';
  return STATIC_ASSETS.has(url.pathname) ? 'static' : 'network';
}

function safePublicResponse(response, pathname) {
  const expectedUrl = new URL(pathname, globalThis.location.origin).href;
  const type = pathname === PACK_URL ? 'application/json' : STATIC_ASSETS.get(pathname);
  return (
    response?.status === 200 &&
    response.type === 'basic' &&
    !response.redirected &&
    response.url === expectedUrl &&
    !response.headers.has('set-cookie') &&
    !/(?:private|no-store|no-cache)/i.test(response.headers.get('cache-control') || '') &&
    !/(?:\*|cookie|authorization|rsc|next-router)/i.test(response.headers.get('vary') || '') &&
    response.headers.get('content-type')?.split(';')[0].trim() === type
  );
}

function publicRequest(pathname) {
  // Construct from a URL, never from a client request (which can carry identity headers).
  return new Request(new URL(pathname, globalThis.location.origin), {
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
  });
}

function unavailablePack() {
  return new Response(JSON.stringify({ ok: false, reason: 'offline_without_cached_pack' }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function readPublic(request, pathname) {
  if (!canReadPublicCache(request) || (pathname !== PACK_URL && !STATIC_ASSETS.has(pathname)))
    return undefined;
  const name = pathname === PACK_URL ? HELP_NOW_CACHE_NAME : CACHE_NAME;
  const response = await (await caches.open(name)).match(publicRequest(pathname));
  return safePublicResponse(response, pathname) ? response : undefined;
}

async function savePublicAssets(paths) {
  const responses = await Promise.all(
    paths.map(async pathname => {
      const response = await fetch(publicRequest(pathname));
      if (!safePublicResponse(response, pathname)) throw new Error('Unsafe public asset');
      return response;
    })
  );
  await Promise.all(
    paths.map(async (pathname, index) => {
      const name = pathname === PACK_URL ? HELP_NOW_CACHE_NAME : CACHE_NAME;
      await (await caches.open(name)).put(publicRequest(pathname), responses[index]);
    })
  );
  return true;
}

async function servePublic(request) {
  const pathname = new URL(request.url).pathname;
  try {
    // Runtime reads do not write. Only an explicit download saves the public pack.
    return await fetch(publicRequest(pathname));
  } catch {
    return (await readPublic(request, pathname)) || unavailablePack();
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch {
    const url = new URL(request.url);
    if (
      request.mode === 'navigate' &&
      canReadPublicCache(request) &&
      HELP_NOW_PUBLIC_ROUTE.test(url.pathname) &&
      (await readPublic(request, PACK_URL))
    ) {
      const template = await readPublic(request, '/offline.html');
      return template
        ? globalThis.pwaOffline.localizeDocument(request, await template.text())
        : globalThis.pwaOffline.notice(request);
    }
    return request.mode === 'navigate' ? globalThis.pwaOffline.notice(request) : unavailablePack();
  }
}

globalThis.addEventListener('install', event => {
  event.waitUntil(globalThis.skipWaiting());
});

async function removeLegacyCaches() {
  await Promise.all(
    (await caches.keys()).filter(key => !CURRENT_CACHES.has(key)).map(key => caches.delete(key))
  );
  return true;
}

const LEGACY_SWEEP_INTERVAL_MS = 5000;
let lastLegacySweep = -Infinity;
let legacySweep;
function purgeLegacyCaches() {
  if (legacySweep) return legacySweep;
  if (Date.now() - lastLegacySweep < LEGACY_SWEEP_INTERVAL_MS) return Promise.resolve(false);
  lastLegacySweep = Date.now();
  legacySweep = removeLegacyCaches()
    .catch(() => false)
    .finally(() => {
      legacySweep = undefined;
    });
  return legacySweep;
}

globalThis.addEventListener('activate', event => {
  event.waitUntil(removeLegacyCaches().then(() => globalThis.clients.claim()));
});

globalThis.addEventListener('message', event => {
  if (!event.source?.url || new URL(event.source.url).origin !== globalThis.location.origin) return;
  if (event.data?.type === 'PURGE_LEGACY_CACHES') {
    event.waitUntil(purgeLegacyCaches());
    return;
  }
  if (event.data?.type !== 'CACHE_HELP_NOW_PACK') return;
  event.waitUntil(
    savePublicAssets([...STATIC_ASSETS.keys(), PACK_URL])
      .then(ok => event.ports[0]?.postMessage({ ok }))
      .catch(() => {
        event.ports[0]?.postMessage({ ok: false });
      })
  );
});

globalThis.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.waitUntil(purgeLegacyCaches());
  event.respondWith(
    classifyRequest(event.request) === 'network'
      ? networkOnly(event.request)
      : servePublic(event.request)
  );
});

globalThis.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Interdomestik', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Interdomestik';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    data: {
      url: payload.url || '/',
    },
  };

  event.waitUntil(globalThis.registration.showNotification(title, options));
});

globalThis.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    globalThis.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (globalThis.clients.openWindow) return globalThis.clients.openWindow(url);
    })
  );
});
