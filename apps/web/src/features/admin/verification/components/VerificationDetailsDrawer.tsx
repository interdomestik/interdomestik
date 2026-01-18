'use client';

import {
  Button,
  Label,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Textarea,
} from '@interdomestik/ui';
import { Check, HelpCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { verifyCashAttemptAction } from '../actions/verification';
import { type CashVerificationDetailsDTO } from '../server/types';
import { VerificationDocuments } from './VerificationDocuments';
import { VerificationSummary } from './VerificationSummary';
import { VerificationTimeline } from './VerificationTimeline';

interface VerificationDetailsDrawerProps {
  attemptId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete: () => void;
}

export function VerificationDetailsDrawer({
  attemptId,
  isOpen,
  onClose,
  onActionComplete,
}: VerificationDetailsDrawerProps) {
  const t = useTranslations('admin.leads');
  const [data, setData] = useState<CashVerificationDetailsDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'reject' | 'needs_info' | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (isOpen && attemptId) {
      setLoading(true);
      fetch(`/api/verification/${attemptId}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          setData(data);
        })
        .catch(() => toast.error(t('toasts.error')))
        .finally(() => setLoading(false));
    } else {
      setData(null);
      setShowNoteInput(false);
      setPendingDecision(null);
      setNote('');
    }
  }, [isOpen, attemptId, t]);

  const initiateAction = (decision: 'reject' | 'needs_info') => {
    setPendingDecision(decision);
    setShowNoteInput(true);
  };

  const executeVerify = async (decision: 'approve' | 'reject' | 'needs_info') => {
    if (!attemptId) return;

    // Validation
    if ((decision === 'reject' || decision === 'needs_info') && !note.trim()) {
      toast.error(t('toasts.note_required'));
      return;
    }

    setActionPending(true);
    const res = await verifyCashAttemptAction({
      attemptId,
      decision,
      note,
    });
    setActionPending(false);

    if (res.success) {
      toast.success(t(`toasts.${decision}_success`));
      onActionComplete();
      onClose();
    } else {
      toast.error(res.error || t('toasts.error'));
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={open => !open && onClose()}>
      <SheetContent className="sm:max-w-md md:max-w-lg flex flex-col h-full">
        <SheetHeader>
          <SheetTitle>{t('drawer.title')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : data ? (
            <>
              <VerificationSummary data={data} />
              <VerificationDocuments documents={data.documents} />
              <VerificationTimeline timeline={data.timeline} />
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground">Failed to load details</div>
          )}
        </div>

        {/* Footer Actions */}
        {data && data.status !== 'succeeded' && data.status !== 'rejected' && (
          <SheetFooter className="pt-4 border-t mt-auto">
            {showNoteInput ? (
              <div className="w-full space-y-3">
                <Label>{t('labels.note')}</Label>
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('placeholders.needs_info_note')}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowNoteInput(false)}>
                    {t('actions.cancel')}
                  </Button>
                  <Button onClick={() => executeVerify(pendingDecision!)} disabled={actionPending}>
                    {t('actions.submit')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 w-full justify-end">
                <Button variant="outline" onClick={() => initiateAction('needs_info')}>
                  <HelpCircle className="w-4 h-4 mr-2" /> {t('actions.needs_info')}
                </Button>
                <Button variant="destructive" onClick={() => initiateAction('reject')}>
                  <X className="w-4 h-4 mr-2" /> {t('actions.reject')}
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => executeVerify('approve')}
                >
                  <Check className="w-4 h-4 mr-2" /> {t('actions.approve')}
                </Button>
              </div>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
