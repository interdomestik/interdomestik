'use client';

import { Button } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { resolveLeadDuplicateAction } from '../actions/lead-duplicates';
import type { DuplicateResolutionOutcome } from '../server/duplicate-resolution-constants';

export function ResolveDuplicateActions({ referralId }: Readonly<{ referralId: string }>) {
  const t = useTranslations('admin.leads.duplicates');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const resolve = (outcome: DuplicateResolutionOutcome) => {
    startTransition(async () => {
      // A transport failure (rejected action) gets the same recoverable error as a refusal.
      const result = await resolveLeadDuplicateAction({ referralId, outcome }).catch(() => null);
      if (result?.success) {
        toast.success(t('toast_resolved'));
        router.refresh();
      } else if (result?.code === 'ALREADY_RESOLVED') {
        toast.error(t('toast_already_resolved'));
        router.refresh();
      } else {
        toast.error(t('toast_error'));
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => resolve('kept_existing')}
        data-testid={`duplicate-keep-${referralId}`}
      >
        {t('keep_existing')}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => resolve('dismissed')}
        data-testid={`duplicate-dismiss-${referralId}`}
      >
        {t('dismiss')}
      </Button>
    </div>
  );
}
