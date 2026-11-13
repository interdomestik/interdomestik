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
import { verificationToastKey } from './approval-toast';
import { fetchVerificationDetails } from './verification-details-fetch';

interface VerificationDetailsDrawerProps {
  attemptId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onActionComplete: () => void;
  viewerRole?: string | null;
}

export function VerificationDetailsDrawer({
  attemptId,
  isOpen,
  onClose,
  onActionComplete,
  viewerRole,
}: VerificationDetailsDrawerProps) {
  const t = useTranslations('admin.leads');
  const [data, setData] = useState<CashVerificationDetailsDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<'reject' | 'needs_info' | null>(null);
  const [actionPending, setActionPending] = useState(false);

  useEffect(() => {
    if (!isOpen || !attemptId) {
      setData(null);
      setLoading(false);
      setError(false);
      setNotFound(false);
      setShowNoteInput(false);
      setPendingDecision(null);
      setNote('');
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(false);
    setNotFound(false);
    fetchVerificationDetails(attemptId).then(
      result => {
        if (!active) return;
        setLoading(false);
        if (result.kind === 'ok') {
          setData(result.data);
          return;
        }
        // An unknown id (stale or hand-edited link) is a calm not-found state, not a failure toast.
        setNotFound(result.kind === 'not_found');
        setError(result.kind === 'error');
        if (result.kind === 'error') toast.error(t('toasts.error'));
      },
      () => {
        if (!active) return;
        setLoading(false);
        setError(true);
        toast.error(t('toasts.error'));
      }
    );
    return () => {
      active = false;
    };
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
      const toastKey = verificationToastKey(decision, res);
      if (toastKey === 'toasts.approve_fulfillment_pending') toast.warning(t(toastKey));
      else toast.success(t(toastKey));
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
    <OpsDrawer
      open={isOpen}
      onOpenChange={open => !open && onClose()}
      title={t('drawer.title')}
      descriptionText={t('drawer.description')}
      closeLabel={t('actions.cancel')}
    >
      <OpsQueryState
        loading={loading}
        error={error}
        isEmpty={notFound || (!data && !loading && !error)}
        loadingLabel={t('drawer.loading')}
        errorLabel={t('drawer.load_error')}
        emptyTitle={t('drawer.not_found_title')}
        emptySubtitle={t('drawer.not_found_description')}
        emptyTestId="verification-details-not-found"
      >
        {data && (
          <>
            <VerificationSummary data={data} />
            <VerificationDocuments documents={data.documents} viewerRole={viewerRole} />
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
