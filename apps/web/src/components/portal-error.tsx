'use client';

import { Button } from '@interdomestik/ui/components/button';
import { useLocale } from 'next-intl';
import { useEffect } from 'react';
import { getPortalErrorCopy } from './portal-error-copy';

export type PortalErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
  retry?: () => void;
}>;

export function PortalError({ error, reset, retry = reset }: PortalErrorProps) {
  const locale = useLocale();
  const copy = getPortalErrorCopy(locale);
  useEffect(() => {
    console.error('Portal page could not be loaded', { digest: error.digest });
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg space-y-4 p-6 text-center">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p className="text-muted-foreground">{copy.description}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" onClick={retry}>
          {copy.retry}
        </Button>
        <Button asChild variant="outline">
          <a href={`/${locale}`}>{copy.home}</a>
        </Button>
      </div>
    </div>
  );
}
