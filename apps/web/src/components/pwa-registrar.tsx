'use client';

import { useEffect } from 'react';

export function PwaRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const isPwaEnabled = process.env.NEXT_PUBLIC_ENABLE_PWA === 'true';

    if (!isPwaEnabled) {
      navigator.serviceWorker
        .getRegistrations()
        .then(async registrations => {
          await Promise.all(registrations.map(registration => registration.unregister()));
          if ('caches' in window) {
            const cacheKeys = await caches.keys();
            await Promise.all(cacheKeys.map(cacheKey => caches.delete(cacheKey)));
          }
          console.log('SW disabled for this environment; existing registrations cleared.');
        })
        .catch(error => {
          console.error('SW cleanup failed: ', error);
        });
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(error => {
        console.error('SW registration failed: ', error);
      });
  }, []);

  return null;
}
