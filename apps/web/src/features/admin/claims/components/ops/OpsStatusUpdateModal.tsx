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

type OpsStatusUpdateModalProps = Readonly<{
  claimId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allowedTransitions: ClaimStatus[];
  locale: string;
}>;

export function OpsStatusUpdateModal({
  claimId,
  isOpen,
  onOpenChange,
  allowedTransitions,
  locale,
}: OpsStatusUpdateModalProps) {
  const tStatus = useTranslations('claims.status');
  const tModal = useTranslations('admin.claims_page.status_modal');

  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!selectedStatus) return;

    startTransition(async () => {
      try {
        const result = await updateStatus(claimId, selectedStatus as ClaimStatus, locale);
        if (result.success) {
          globalThis.location.reload();
          toast.success(tModal('success'));
          onOpenChange(false);
        } else {
          toast.error(result.error || tModal('error'));
        }
      } catch {
        toast.error(tModal('unexpected_error'));
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tModal('title')}</DialogTitle>
          <DialogDescription>{tModal('description')}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Select onValueChange={setSelectedStatus}>
            <SelectTrigger>
              <SelectValue placeholder={tModal('placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {allowedTransitions.map(status => (
                <SelectItem key={status} value={status}>
                  {tStatus(status)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {tModal('cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStatus || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tModal('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
