export function isPwaEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_PWA === 'true';
}

function ownsRegistration(registration: ServiceWorkerRegistration): boolean {
  return [registration.active, registration.waiting, registration.installing].some(worker => {
    if (!worker) return false;
    const url = new URL(worker.scriptURL);
    return url.origin === globalThis.location.origin && url.pathname === '/sw.js';
  });
}

export function registerPwaWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!isPwaEnabled() || !globalThis.navigator?.serviceWorker) return Promise.resolve(undefined);
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export async function removeDisabledPwaWorker(): Promise<void> {
  if (isPwaEnabled()) return;
  const serviceWorker = globalThis.navigator?.serviceWorker;
  if (serviceWorker) {
    const registrations = await serviceWorker.getRegistrations();
    await Promise.all(registrations.filter(ownsRegistration).map(item => item.unregister()));
  }
  if (globalThis.caches) {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(key => key.startsWith('interdomestik-')).map(key => caches.delete(key))
    );
  }
}
