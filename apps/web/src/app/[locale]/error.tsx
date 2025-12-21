'use client';

import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('common');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center space-y-4">
      <div>
        <p className="text-sm uppercase tracking-wide text-muted-foreground">{t('errors.title')}</p>
        <h1 className="text-3xl font-bold">{t('errors.generic')}</h1>
        <p className="text-muted-foreground mt-2">{t('errors.retry')}</p>
        {error?.digest && <p className="mt-2 text-xs text-muted-foreground">Ref: {error.digest}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => reset()}>
          {t('tryAgain')}
        </Button>
      </div>
    </div>
  );
}
