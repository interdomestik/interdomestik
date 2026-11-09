import type { NotificationPreferences } from '@/actions/user-settings';
import { isPwaEnabled, registerPwaWorker } from './registration';

export type PushSyncResult = Readonly<{ ok: true } | { ok: false; reason: 'push-sync-failed' }>;
const SYNCED: PushSyncResult = { ok: true };
const FAILED: PushSyncResult = { ok: false, reason: 'push-sync-failed' };

async function unsubscribePush(): Promise<PushSyncResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return SYNCED;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return SYNCED;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return SYNCED;
  const results = await Promise.allSettled([
    Promise.resolve()
      .then(() =>
        fetch('/api/settings/push', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        })
      )
      .then(response => response.ok),
    Promise.resolve().then(() => existing.unsubscribe()),
  ]);
  return results.every(result => result.status === 'fulfilled' && result.value === true)
    ? SYNCED
    : FAILED;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function subscribePush(): Promise<PushSyncResult> {
  if (!isPwaEnabled()) return SYNCED;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return SYNCED;
  }

  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return SYNCED;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return SYNCED;
  }

  const registration = await registerPwaWorker();
  if (!registration) return SYNCED;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return SYNCED;
  }

  const response = await fetch('/api/settings/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      userAgent: navigator.userAgent,
    }),
  });
  return response.ok ? SYNCED : FAILED;
}

export async function syncPushSubscription(
  preferences: Readonly<NotificationPreferences>
): Promise<PushSyncResult> {
  try {
    if (!preferences.pushClaimUpdates && !preferences.pushMessages) return await unsubscribePush();
    return await subscribePush();
  } catch {
    return FAILED;
  }
}
