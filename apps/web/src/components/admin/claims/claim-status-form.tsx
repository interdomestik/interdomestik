'use client';

import { updateClaimStatus } from '@/actions/admin-claims';
import { CLAIM_STATUSES, type ClaimStatus } from '@interdomestik/database/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface ClaimStatusFormProps {
  claimId: string;
  currentStatus: string;
  locale: string;
}

export function ClaimStatusForm({ claimId, currentStatus, locale }: ClaimStatusFormProps) {
  const t = useTranslations('claims.status');
  const [status, setStatus] = useState<ClaimStatus>(currentStatus as ClaimStatus);
  const [isPending, setIsPending] = useState(false);

  const handleStatusChange = async (newStatus: ClaimStatus) => {
    setIsPending(true);
    const formData = new FormData();
    formData.append('claimId', claimId);
    formData.append('status', newStatus);
    formData.append('locale', locale);

    try {
      await updateClaimStatus(formData);
      setStatus(newStatus);
      toast.success('Status updated successfully');
    } catch (error) {
      toast.error('Failed to update status');
      console.error(error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={status}
        onValueChange={value => handleStatusChange(value as ClaimStatus)}
        disabled={isPending}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {CLAIM_STATUSES.map(s => (
            <SelectItem key={s} value={s} className="capitalize">
              {t(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
