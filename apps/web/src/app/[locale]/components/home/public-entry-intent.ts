export const PUBLIC_INTENT_EVENT = 'interdomestik:public-intent';

export type PublicEntryIntent = 'vehicle' | 'injury';

let pendingIntent: PublicEntryIntent | null = null;

export function dispatchPublicEntryIntent(intent: PublicEntryIntent): void {
  if (typeof window === 'undefined') return;
  pendingIntent = intent;
  window.dispatchEvent(
    new CustomEvent(PUBLIC_INTENT_EVENT, {
      detail: { intent },
    })
  );
}

export function takePendingPublicEntryIntent(): PublicEntryIntent | null {
  if (typeof window === 'undefined') return null;
  const intent = pendingIntent;
  pendingIntent = null;
  return intent;
}

export function readPublicEntryIntent(event: Event): PublicEntryIntent | null {
  const detail = (event as CustomEvent<unknown>).detail;
  if (typeof detail !== 'object' || detail === null || !('intent' in detail)) {
    return null;
  }

  return detail.intent === 'vehicle' || detail.intent === 'injury' ? detail.intent : null;
}
