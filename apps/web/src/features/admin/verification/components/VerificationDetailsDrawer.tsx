'use client';

import { verifyCashAttemptAction } from '../actions/verification';
import { type CashVerificationDetailsDTO } from '../server/verification.core';
import {
  Badge,
  Button,
  Label,
  Separator,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Textarea,
} from '@interdomestik/ui';
import { Check, Clock, FileText, HelpCircle, User, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'succeeded':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            {t('status.succeeded')}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">{t('status.rejected')}</Badge>
        );
      case 'needs_info':
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
            {t('status.needs_info')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{t('status.pending')}</Badge>;
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
              {/* Summary */}
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {data.firstName} {data.lastName}
                    </h3>
                    <p className="text-sm text-muted-foreground">{data.email}</p>
                  </div>
                  {getStatusBadge(data.status)}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted/50 rounded-md">
                    <span className="text-muted-foreground block text-xs uppercase">
                      {t('table.amount')}
                    </span>
                    <span className="font-medium text-lg">
                      {(data.amount / 100).toLocaleString('de-DE', {
                        style: 'currency',
                        currency: data.currency,
                      })}
                    </span>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <span className="text-muted-foreground block text-xs uppercase">
                      {t('table.branch')}
                    </span>
                    <span className="font-medium">{data.branchName}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Documents */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <FileText className="w-4 h-4" /> {t('drawer.documents')}
                </h4>
                {data.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    {t('labels.missing_proof')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.documents.map(doc => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2 border rounded-md text-sm"
                      >
                        <span className="truncate max-w-[200px]" title={doc.name}>
                          {doc.name}
                        </span>
                        <Button variant="ghost" size="sm" asChild className="h-7">
                          <a href={doc.url} target="_blank" rel="noopener noreferrer">
                            {t('actions.view_proof')}
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Timeline */}
              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" /> {t('drawer.timeline')}
                </h4>
                <div className="border-l-2 border-muted ml-2 space-y-6 pl-4 py-2">
                  {data.timeline.map(event => (
                    <div key={event.id} className="relative">
                      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/30 ring-4 ring-background" />
                      <p className="text-sm font-medium">{event.title}</p>
                      {event.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(event.date).toLocaleString()}</span>
                        {event.actorName && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" /> {event.actorName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
