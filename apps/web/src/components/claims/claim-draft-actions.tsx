'use client';

import { cancelClaim } from '@/actions/claims';
import { Link, useRouter } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

type ClaimDraftActionsProps = {
  claimId: string;
};

export function ClaimDraftActions({ claimId }: ClaimDraftActionsProps) {
  const t = useTranslations('claims.actions');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCancel = () => {
    const confirmed = window.confirm(t('cancelConfirm'));
    if (!confirmed) return;

    startTransition(async () => {
      const result = await cancelClaim(claimId);
      if (result.success) {
        toast.success(t('cancelled'));
        router.push('/dashboard/claims');
        return;
      }

      toast.error(result.error || t('cancelFailed'));
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/dashboard/claims/${claimId}/edit`}>{t('editDraft')}</Link>
      </Button>
      <Button variant="destructive" size="sm" onClick={handleCancel} disabled={isPending}>
        {t('cancelClaim')}
      </Button>
    </div>
  );
}
