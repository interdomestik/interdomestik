self.addEventListener('push', event => {
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

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const url = event.notification?.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
