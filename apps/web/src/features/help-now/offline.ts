import { getTripModeDownloadAssets, HELP_NOW_CACHE_NAME } from './content-packs';

export type OfflineSaveResult = 'saved' | 'unsupported' | 'failed';
const HELP_NOW_PUBLIC_ROUTE = /^\/(sq|en|sr|mk)\/help-now\/?$/;

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
