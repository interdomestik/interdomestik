const CACHE_NAME = 'interdomestik-offline-v1';
const HELP_NOW_CACHE_NAME = 'interdomestik-help-now-v1';
const OFFLINE_URL = '/offline.html'; // Offline fallback page
const HELP_NOW_PUBLIC_ASSETS = new Set(['/help-now-packs/content-packs.v1.json']);
const HELP_NOW_PUBLIC_ROUTE = /^\/(sq|en|sr|mk|de|hr)\/help-now\/?$/;

function isSameOrigin(url) {
  return url.origin === globalThis.location.origin;
}

function deleteOldInterdomestikCaches(keys) {
  return Promise.all(
    keys
      .filter(
        key => key.startsWith('interdomestik-') && key !== CACHE_NAME && key !== HELP_NOW_CACHE_NAME
      )
      .map(key => caches.delete(key))
  );
}

async function helpNowFallbackResponse(request) {
  if (new URL(request.url).pathname.endsWith('.json')) {
    return new Response(JSON.stringify({ ok: false, reason: 'offline_without_cached_pack' }), {
      headers: { 'content-type': 'application/json; charset=utf-8' },
      status: 503,
    });
  }

  return (
    (await caches.match(request)) ||
    (await caches.match(OFFLINE_URL)) ||
    new Response('Offline', { status: 503 })
  );
}

async function cacheFreshResponse(request, response) {
  const pathname = new URL(request.url).pathname;
  if (
    !response.ok ||
    (!HELP_NOW_PUBLIC_ASSETS.has(pathname) && !HELP_NOW_PUBLIC_ROUTE.test(pathname))
  ) {
    return;
  }
  try {
    await (await caches.open(HELP_NOW_CACHE_NAME)).put(request, response.clone());
  } catch {}
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    await cacheFreshResponse(request, response);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return helpNowFallbackResponse(request);
  }
}

globalThis.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache =>
        cache.addAll([
          '/favicon.ico',
          '/manifest.json',
          OFFLINE_URL,
          '/icon-192.png',
          '/icon-512.png',
        ])
      )
  );
  globalThis.skipWaiting();
});

globalThis.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(deleteOldInterdomestikCaches)
      .then(() => globalThis.clients.claim())
  );
});

globalThis.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== 'GET') {
    return;
  }

  if (isSameOrigin(requestUrl) && HELP_NOW_PUBLIC_ASSETS.has(requestUrl.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    if (isSameOrigin(requestUrl) && HELP_NOW_PUBLIC_ROUTE.test(requestUrl.pathname)) {
      event.respondWith(networkFirst(event.request));
      return;
    }

    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then(response => {
          return response || caches.match(OFFLINE_URL);
        });
      })
    );
  }
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
