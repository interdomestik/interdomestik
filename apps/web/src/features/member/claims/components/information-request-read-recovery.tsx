'use client';

import { useRouter } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

export function InformationRequestReadRecovery() {
  const t = useTranslations('claims.informationRequests');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3" data-testid="information-request-read-recovery">
      <output className="block" aria-live="polite" aria-atomic="true">
        {isPending ? t('loadingRequests') : t('loadError')}
      </output>
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-10 max-w-full whitespace-normal break-words text-center"
        aria-busy={isPending}
        aria-disabled={isPending}
        onClick={() => {
          if (isPending) return;
          startTransition(() => router.refresh());
        }}
      >
        {t('retryRead')}
      </Button>
    </div>
  );
}
