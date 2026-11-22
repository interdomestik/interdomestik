'use client';

import { type ClaimStatus } from '@interdomestik/database/constants';
import {
  RECOVERY_DECLINE_REASON_CODES,
  type RecoveryDeclineReasonCode,
} from '@interdomestik/domain-claims/staff-claims/types';
import { Textarea } from '@interdomestik/ui/components/textarea';
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
import { isCommittedRefreshPending } from '../../actions/ops-action-outcome';
import { updateStatus } from '../../actions/ops-actions';

type OpsStatusUpdateModalProps = Readonly<{
  claimId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  allowedTransitions: ClaimStatus[];
  locale: string;
  initialStatus?: ClaimStatus;
  /**
   * Called when the status change was committed but the post-commit refresh failed. The owner
   * shows the persistent localized warning; this modal then neither toasts nor reloads.
   */
  onCommittedRefreshPending: () => void;
}>;

export function OpsStatusUpdateModal({
  claimId,
  isOpen,
  onOpenChange,
  allowedTransitions,
  locale,
  initialStatus,
  onCommittedRefreshPending,
}: OpsStatusUpdateModalProps) {
  const tStatus = useTranslations('claims.status');
  const tModal = useTranslations('admin.claims_page.status_modal');
  const tStatusForm = useTranslations('admin.claims_page.status_form');
  const tCommon = useTranslations('common');
  const tRecovery = useTranslations('agent-claims.claims.staff_actions.recovery_decision');

  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(initialStatus);
  const [declineCode, setDeclineCode] = useState<RecoveryDeclineReasonCode>();
  const [explanation, setExplanation] = useState('');
  const isDecline = selectedStatus === 'rejected';
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!selectedStatus || (isDecline && !declineCode)) return;

    startTransition(async () => {
      try {
        const result = isDecline
          ? await updateStatus(claimId, 'rejected', locale, {
              declineReasonCode: declineCode,
              decisionExplanation: explanation.trim() || undefined,
            })
          : await updateStatus(claimId, selectedStatus as ClaimStatus, locale);
        if (isCommittedRefreshPending(result)) {
          onOpenChange(false);
          onCommittedRefreshPending();
          return;
        }
        if (result.success) {
          toast.success(tStatusForm('success'));
          globalThis.location.reload();
          onOpenChange(false);
        } else {
          toast.error(result.error || tStatusForm('error'));
        }
      } catch {
        toast.error(tCommon('errors.generic'));
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
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
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

        {isDecline && (
          <div className="grid gap-3">
            <div className="grid gap-1">
              <label htmlFor="ops-decline-code">{tRecovery('decline_category_label')}</label>
              <Select
                value={declineCode}
                onValueChange={value => setDeclineCode(value as RecoveryDeclineReasonCode)}
              >
                <SelectTrigger id="ops-decline-code">
                  <SelectValue placeholder={tRecovery('decline_category_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {RECOVERY_DECLINE_REASON_CODES.map(code => (
                    <SelectItem key={code} value={code}>
                      {tRecovery(`decline_reasons.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <label htmlFor="ops-decline-explanation">{tRecovery('explanation_label')}</label>
              <Textarea
                id="ops-decline-explanation"
                value={explanation}
                maxLength={2000}
                onChange={event => setExplanation(event.target.value)}
                placeholder={tRecovery('explanation_placeholder')}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {tModal('cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedStatus || isPending || (isDecline && !declineCode)}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tModal('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
