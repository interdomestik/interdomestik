import type { NotificationPreferences } from '@/actions/user-settings';
import { isPwaEnabled, registerPwaWorker } from './registration';

async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const existing = await registration.pushManager.getSubscription();
    if (!existing) return;
    await fetch('/api/settings/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: existing.endpoint }),
    });
    await existing.unsubscribe();
  } catch {
    // Preferences save should still succeed when unsubscribe is unavailable.
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function syncPushSubscription(
  nextPreferences: Readonly<NotificationPreferences>
): Promise<void> {
  if (!nextPreferences.pushClaimUpdates && !nextPreferences.pushMessages) {
    await unsubscribePush();
    return;
  }
  if (!isPwaEnabled()) return;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    return;
  }

  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return;
  }

  const registration = await registerPwaWorker();
  if (!registration) return;

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
    return;
  }

  await fetch('/api/settings/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      keys: { p256dh, auth },
      userAgent: navigator.userAgent,
    }),
  });
}
