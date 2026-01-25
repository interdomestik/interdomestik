'use client';

import { Button, Label, Textarea } from '@interdomestik/ui';
import { Check, HelpCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { OpsActionBar, OpsDrawer, OpsQueryState } from '@/components/ops';
import { getVerificationActions } from '@/components/ops/adapters/verification';
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
  const [error, setError] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'reject' | 'needs_info' | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (isOpen && attemptId) {
      setLoading(true);
      setError(false);
      fetch(`/api/verification/${attemptId}`)
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          setData(data);
        })
        .catch(() => {
          toast.error(t('toasts.error'));
          setError(true);
        })
        .finally(() => setLoading(false));
    } else {
      setData(null);
      setError(false);
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

  const actions = data
    ? getVerificationActions({
        status: data.status,
        onApprove: () => executeVerify('approve'),
        onReject: () => initiateAction('reject'),
        onNeedsInfo: () => initiateAction('needs_info'),
        labels: {
          approve: t('actions.approve'),
          reject: t('actions.reject'),
          needsInfo: t('actions.needs_info'),
        },
        icons: {
          approve: <Check className="w-4 h-4 mr-2" />,
          reject: <X className="w-4 h-4 mr-2" />,
          needsInfo: <HelpCircle className="w-4 h-4 mr-2" />,
        },
      })
    : null;

  return (
    <OpsDrawer open={isOpen} onOpenChange={open => !open && onClose()} title={t('drawer.title')}>
      <OpsQueryState
        loading={loading}
        error={error}
        isEmpty={!data && !loading && !error}
        loadingLabel="Loading details..."
      >
        {data && (
          <>
            <VerificationSummary data={data} />
            <VerificationDocuments documents={data.documents} />
            <VerificationTimeline timeline={data.timeline} />

            {actions && (
              <OpsActionBar primary={actions.primary} secondary={actions.secondary}>
                {showNoteInput && (
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
                      <Button
                        onClick={() => executeVerify(pendingDecision!)}
                        disabled={actionPending}
                        data-testid="ops-action-submit"
                      >
                        {t('actions.submit')}
                      </Button>
                    </div>
                  </div>
                )}
              </OpsActionBar>
            )}
          </>
        )}
      </OpsQueryState>
    </OpsDrawer>
  );
}
