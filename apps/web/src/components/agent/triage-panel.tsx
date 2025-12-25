'use client';

import { updateClaimStatus } from '@/actions/agent-claims';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

const TRIAGE_STATUSES = CLAIM_STATUSES.filter(status => status !== 'draft') as Exclude<
  ClaimStatus,
  'draft'
>[];

export function TriagePanel({
  claimId,
  currentStatus,
}: {
  claimId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (value: ClaimStatus) => {
    startTransition(async () => {
      await updateClaimStatus(claimId, value);
    });
  };

  const t = useTranslations('agent-claims.claims.triage');
  const tStatus = useTranslations('claims.status');

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{t('title')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">{t('changeStatus')}</label>
          <Select
            defaultValue={currentStatus}
            onValueChange={value => handleStatusChange(value as ClaimStatus)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('selectStatus')} />
            </SelectTrigger>
            <SelectContent>
              {TRIAGE_STATUSES.map(status => (
                <SelectItem key={status} value={status} className="capitalize">
                  {tStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('verification')}
            disabled={isPending || currentStatus === 'verification'}
          >
            {t('verify')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleStatusChange('rejected')}
            disabled={isPending || currentStatus === 'rejected'}
          >
            {t('reject')}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground mt-4">{t('notice')}</div>
      </CardContent>
    </Card>
  );
}
