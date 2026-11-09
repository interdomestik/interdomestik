'use client';

import { isPwaEnabled, registerPwaWorker, removeDisabledPwaWorker } from '@/lib/pwa/registration';
import { useEffect } from 'react';

export function PwaRegistrar() {
  useEffect(() => {
    const operation = isPwaEnabled() ? registerPwaWorker() : removeDisabledPwaWorker();
    operation.catch(error => console.error('PWA registration policy failed:', error));
  }, []);
  return null;
}
