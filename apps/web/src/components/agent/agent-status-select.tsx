'use client';

import { updateClaimStatus } from '@/actions/agent-claims';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

const AGENT_STATUSES = CLAIM_STATUSES.filter(status => status !== 'draft') as Exclude<
  ClaimStatus,
  'draft'
>[];

export function AgentStatusSelect({
  claimId,
  currentStatus,
  disabled = false,
}: {
  claimId: string;
  currentStatus: string;
  disabled?: boolean;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const t = useTranslations('common.interface');

  const handleStatusChange = (value: ClaimStatus) => {
    if (disabled) return;
    startTransition(async () => {
      try {
        await updateClaimStatus(claimId, value);
        toast.success(t('statusSuccess'));
      } catch (error) {
        toast.error(t('statusError'));
        console.error(error);
      }
    });
  };

  const tStatus = useTranslations('claims.status');
  const tDetails = useTranslations('agent-claims.claims.details');

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground mr-1">
        {tDetails('status_label')}:
      </span>
      <Select
        defaultValue={currentStatus}
        onValueChange={value => handleStatusChange(value as ClaimStatus)}
        disabled={isPending || disabled}
      >
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder={tDetails('status_label')} />
        </SelectTrigger>
        <SelectContent>
          {AGENT_STATUSES.map(status => (
            <SelectItem key={status} value={status} className="capitalize">
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
