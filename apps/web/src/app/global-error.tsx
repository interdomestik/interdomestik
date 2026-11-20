'use client';

import { Button } from '@interdomestik/ui';
import '@interdomestik/ui/globals.css';
import { useLogger } from 'next-axiom';
import { useEffect, useSyncExternalStore } from 'react';
import { errorLocale, getPortalErrorCopy } from '@/components/portal-error-copy';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import type { PortalErrorProps } from '@/components/portal-error';

const subscribe = () => () => undefined;
const serverLocale = () => DEFAULT_LOCALE;
const browserLocale = () => errorLocale(globalThis.location?.pathname.split('/')[1]);

export default function GlobalError({ error, reset, retry = reset }: PortalErrorProps) {
  const locale = useSyncExternalStore(subscribe, browserLocale, serverLocale);
  const copy = getPortalErrorCopy(locale);
  const log = useLogger();

  useEffect(() => {
    log.error('Global Error Boundary', {
      digest: error.digest,
    });
  }, [error, log]);
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <div className="flex min-h-screen flex-col items-center justify-center text-center space-y-4 p-4 bg-background text-foreground">
          <h1 className="text-3xl font-bold">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.description}</p>
          <Button onClick={retry}>{copy.retry}</Button>
        </div>
      </body>
    </html>
  );
}
