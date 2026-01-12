'use client';

import { type ClaimStatus } from '@interdomestik/database/constants';
import { Button } from '@interdomestik/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@interdomestik/ui/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateStatus } from '../../actions/ops-actions';

interface OpsStatusUpdateModalProps {
  claimId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allowedTransitions: ClaimStatus[];
  locale: string;
}

export function OpsStatusUpdateModal({
  claimId,
  isOpen,
  onOpenChange,
  allowedTransitions,
  locale,
}: OpsStatusUpdateModalProps) {
  const t = useTranslations('claims.status');

  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!selectedStatus) return;

    startTransition(async () => {
      try {
        const result = await updateStatus(claimId, selectedStatus as ClaimStatus, locale);
        if (result.success) {
          toast.success('Status updated successfully');
          onOpenChange(false);
        } else {
          toast.error(result.error || 'Failed to update status');
        }
      } catch {
        toast.error('An unexpected error occurred');
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Claim Status</DialogTitle>
          <DialogDescription>
            Select the new status for this claim. This action will be logged.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Select new status..." />
            </SelectTrigger>
            <SelectContent>
              {allowedTransitions.map(status => (
                <SelectItem key={status} value={status}>
                  {t(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStatus || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirm Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
