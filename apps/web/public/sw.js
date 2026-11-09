// Only these reviewed, credential-free public resources may enter Cache Storage.
const CACHE_NAME = 'interdomestik-offline-v2';
const HELP_NOW_CACHE_NAME = 'interdomestik-help-now-v2';
const CURRENT_CACHES = new Set([CACHE_NAME, HELP_NOW_CACHE_NAME]);
const PACK_URL = '/help-now-packs/content-packs.v1.json';
const STATIC_ASSETS = new Map([
  ['/offline.html', 'text/html'],
  ['/offline.css', 'text/css'],
]);
const HELP_NOW_PUBLIC_ROUTE = /^\/(sq|en|sr|mk|de|hr)\/help-now\/?$/;
const OFFLINE_COPY = {
  en: [
    'You are offline',
    'Reconnect to view your workspace. No cached records are available. Changes are not queued or sent while offline.',
    'Retry',
  ],
  sq: [
    'Jeni jashtë linje',
    'Rilidhuni për të parë hapësirën tuaj të punës. Nuk ka të dhëna të ruajtura për përdorim jashtë linje. Ndryshimet nuk vendosen në radhë dhe nuk dërgohen jashtë linje.',
    'Provo përsëri',
  ],
  mk: [
    'Немате интернет-врска',
    'Поврзете се за да го видите работниот простор. Нема зачувани записи. Промените не се ставаат во редица и не се испраќаат без интернет-врска.',
    'Обиди се повторно',
  ],
  sr: [
    'Niste povezani na internet',
    'Povežite se da biste videli radni prostor. Nema keširanih podataka. Promene se ne stavljaju u red niti šalju dok ste van mreže.',
    'Pokušaj ponovo',
  ],
  de: [
    'Du bist offline',
    'Verbinde dich mit dem Internet, um deinen Arbeitsbereich zu sehen. Es sind keine zwischengespeicherten Daten verfügbar. Änderungen werden offline weder vorgemerkt noch gesendet.',
    'Erneut versuchen',
  ],
};
function classifyRequest(request) {
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== globalThis.location.origin ||
    url.search ||
    request.cache === 'no-store' ||
    /private|no-store/i.test(request.headers.get('cache-control') || '') ||
    /text\/x-component/i.test(request.headers.get('accept') || '') ||
    ['authorization', 'range', 'rsc', 'next-router-prefetch', 'next-action'].some(header =>
      request.headers.has(header)
    )
  )
    return 'network';
  if (url.pathname === PACK_URL) return 'pack';
  return STATIC_ASSETS.has(url.pathname) ? 'static' : 'network';
}

function safePublicResponse(response, pathname) {
  const expectedUrl = new URL(pathname, globalThis.location.origin).href;
  const type = pathname === PACK_URL ? 'application/json' : STATIC_ASSETS.get(pathname);
  return (
    response &&
    response.status === 200 &&
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

function offlineNotice(request) {
  const requestedLocale = new URL(request.url).pathname.split('/')[1];
  const locale = Object.hasOwn(OFFLINE_COPY, requestedLocale) ? requestedLocale : 'en';
  const [title, body, retry] = OFFLINE_COPY[locale];
  return new Response(
    `<!doctype html><html lang="${locale}"><meta name="viewport" content="width=device-width">` +
      `<title>${title} | Interdomestik</title><h1>${title}</h1><p>${body}</p>` +
      `<a href="">${retry}</a></html>`,
    {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    }
  );
}

function unavailablePack() {
  return new Response(JSON.stringify({ ok: false, reason: 'offline_without_cached_pack' }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

async function readPublic(pathname) {
  const name = pathname === PACK_URL ? HELP_NOW_CACHE_NAME : CACHE_NAME;
  if (!(await caches.keys()).includes(name)) return undefined;
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
    return (await readPublic(pathname)) || unavailablePack();
  }
}

async function networkOnly(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch {
    const url = new URL(request.url);
    if (
      request.mode === 'navigate' &&
      url.origin === globalThis.location.origin &&
      HELP_NOW_PUBLIC_ROUTE.test(url.pathname) &&
      !url.search &&
      !['rsc', 'next-action'].some(header => request.headers.has(header)) &&
      (await readPublic(PACK_URL))
    ) {
      return (await readPublic('/offline.html')) || offlineNotice(request);
    }
    return request.mode === 'navigate' ? offlineNotice(request) : unavailablePack();
  }
}

globalThis.addEventListener('install', event => {
  event.waitUntil(globalThis.skipWaiting());
});

async function activatePublicCaches() {
  await Promise.all(
    (await caches.keys()).filter(key => !CURRENT_CACHES.has(key)).map(key => caches.delete(key))
  );
  await globalThis.clients.claim();
}

globalThis.addEventListener('activate', event => {
  event.waitUntil(activatePublicCaches());
});

globalThis.addEventListener('message', event => {
  if (!event.source?.url || new URL(event.source.url).origin !== globalThis.location.origin) return;
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
