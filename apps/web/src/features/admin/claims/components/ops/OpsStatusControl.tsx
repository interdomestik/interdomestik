'use client';

import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { updateStatus } from '../../actions/ops-actions';

interface OpsStatusControlProps {
  claimId: string;
  currentStatus: string;
  allowedTransitions: string[];
  locale: string;
}

export function OpsStatusControl({
  claimId,
  currentStatus,
  allowedTransitions,
  locale,
}: OpsStatusControlProps) {
  const t = useTranslations('claims.status');
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (newStatus: string) => {
    startTransition(async () => {
      try {
        const result = await updateStatus(claimId, newStatus as ClaimStatus, locale);
        if (!result.success) {
          toast.error(result.error || 'Failed to update status');
        } else {
          toast.success('Status updated successfully');
        }
      } catch (_error) {
        toast.error('An unexpected error occurred');
      }
    });
  };

  // If strict, we only show current + allowed.
  // Or all, and let server reject? Better UX is to filter.
  // But always include current status to show it.
  const options = CLAIM_STATUSES.filter(s => s === currentStatus || allowedTransitions.includes(s));

  return (
    <div className="flex items-center gap-2">
      <Select value={currentStatus} onValueChange={handleStatusChange} disabled={isPending}>
        <SelectTrigger className="w-[180px] h-9 text-xs capitalize">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {options.map(s => (
            <SelectItem key={s} value={s} className="capitalize text-xs">
              {t(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
