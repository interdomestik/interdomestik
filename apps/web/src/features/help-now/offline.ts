import { getTripModeDownloadAssets, HELP_NOW_CACHE_NAME } from './content-packs';

export type OfflineSaveResult = 'saved' | 'unsupported' | 'failed';

export async function saveTripModePackForOffline(): Promise<OfflineSaveResult> {
  if (typeof globalThis.caches === 'undefined') return 'unsupported';

  try {
    const cache = await globalThis.caches.open(HELP_NOW_CACHE_NAME);
    await cache.addAll([...getTripModeDownloadAssets()]);
    return 'saved';
  } catch {
    return 'failed';
  }
}
