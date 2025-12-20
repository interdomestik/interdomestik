'use client';

import { updateClaimStatus } from '@/actions/agent-claims';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

const STATUSES = [
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
];

export function AgentStatusSelect({
  claimId,
  currentStatus,
}: {
  claimId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (value: string) => {
    startTransition(async () => {
      try {
        await updateClaimStatus(claimId, value);
        toast.success('Status updated successfully');
      } catch (error) {
        toast.error('Failed to update status');
        console.error(error);
      }
    });
  };

  const tStatus = useTranslations('claims.status');
  const tDetails = useTranslations('agent.details');

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-muted-foreground mr-1">
        {tDetails('status_label')}:
      </span>
      <Select defaultValue={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
        <SelectTrigger className="w-[180px] h-9">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map(status => (
            <SelectItem key={status} value={status} className="capitalize">
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
