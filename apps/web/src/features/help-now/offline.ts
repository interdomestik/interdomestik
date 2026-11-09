import { sendPwaWorkerMessage } from '@/lib/pwa/worker-message';

export type OfflineSaveResult = 'saved' | 'unsupported' | 'failed';
const HELP_NOW_PUBLIC_ROUTE = /^\/(sq|en|sr|mk|de|hr)\/help-now\/?$/;

export async function saveTripModePackForOffline(): Promise<OfflineSaveResult> {
  const worker = globalThis.navigator?.serviceWorker?.controller;
  if (!worker || typeof MessageChannel === 'undefined' || !globalThis.caches) return 'unsupported';
  if (!HELP_NOW_PUBLIC_ROUTE.test(globalThis.location?.pathname ?? '')) return 'unsupported';
  try {
    return (await sendPwaWorkerMessage(worker, 'CACHE_HELP_NOW_PACK')) ? 'saved' : 'failed';
  } catch {
    return 'failed';
  }
}
