'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { useOpsSelectionParam, trackOpsEvent } from '@/components/ops';
import { useResponsiveSearch } from '@/hooks/use-responsive-search';
import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { verifyCashAttemptAction } from '../../actions/verification';
import { type CashVerificationRequestDTO } from '../../server/types';
import { VerificationActionDialog } from '../VerificationActionDialog';
import { VerificationDetailsDrawer } from '../VerificationDetailsDrawer';
import { VerificationFiltersBar } from './VerificationFiltersBar';
import { VerificationKpis } from './VerificationKpis';
import { VerificationTableV2 } from './VerificationTableV2';

interface VerificationOpsCenterClientProps {
  initialData: CashVerificationRequestDTO[];
  initialParams: { view: 'queue' | 'history'; query: string };
}

export function VerificationOpsCenterClient({
  initialData,
  initialParams,
}: VerificationOpsCenterClientProps) {
  const t = useTranslations('admin.leads');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    selectedId: selectedAttemptId,
    setSelectedId: baseSetSelectedId,
    clearSelectedId: baseClearSelectedId,
  } = useOpsSelectionParam();

  // Shared responsive search: the draft stays editable while a navigation is
  // outstanding, and a burst of keystrokes commits once, after the last one.
  // Default param policy: the raw term is written as typed, an empty term
  // deletes the key, and every other param is left exactly as it is.
  const {
    draft: searchQuery,
    pendingKind,
    isNavigationPending,
    editDraft,
    requestNavigation,
    cancelScheduledSearch,
    getPendingKind,
  } = useResponsiveSearch({
    searchParams,
    searchKey: 'query',
    pathname,
    initialDraft: initialParams.query,
    navigate: query => {
      router.replace(`${pathname}?${query}`);
    },
  });

  // A real sibling navigation (sidebar, tab anchor) drops queued search work.
  useSiblingNavigationCancel(cancelScheduledSearch);

  // Selection navigation is programmatic, so the click listener cannot observe
  // it: the queued commit is dropped here, synchronously, before the replace.
  const handleSelect = (id: string) => {
    trackOpsEvent({ surface: 'verification', action: 'select', entityId: id });
    cancelScheduledSearch(null);
    baseSetSelectedId(id);
  };

  const handleCloseDetails = () => {
    cancelScheduledSearch(null);
    baseClearSelectedId();
  };

  const [requests, setRequests] = useState(initialData);

  // Sync prop to state
  useEffect(() => {
    setRequests(initialData);
  }, [initialData]);

  // Action Dialog State
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<'reject' | 'needs_info' | null>(null);
  const [note, setNote] = useState('');

  const handleViewChange = (view: 'queue' | 'history') => {
    // Only a real outstanding filter navigation blocks another one: a queued
    // search draft is superseded by the view change instead of blocking it.
    if (getPendingKind() === 'filter') {
      return;
    }

    // Shared ownership: this cancels the queued search synchronously and keeps
    // the committed query, clearing only the selection.
    requestNavigation({ view, selected: null }, 'filter');
  };

  // Derive KPIs from data
  const kpis = useMemo(() => {
    const pending = requests.filter(r => r.status === 'pending' && !r.isResubmission).length;
    const needsInfo = requests.filter(r => r.status === 'needs_info').length;
    const resubmitted = requests.filter(r => r.isResubmission && r.status === 'pending').length;
    const approved = requests.filter(r => r.status === 'succeeded').length;
    return { pending, needsInfo, resubmitted, approved };
  }, [requests]);

  const handleVerify = async (
    attemptId: string,
    decision: 'approve' | 'reject' | 'needs_info',
    note?: string
  ) => {
    const res = await verifyCashAttemptAction({
      attemptId,
      decision,
      note,
    });

    if (res.success) {
      trackOpsEvent({ surface: 'verification', action: decision, entityId: attemptId });
      toast.success(t(`toasts.${decision}_success`));
      if (decision === 'needs_info') {
        setRequests(prev =>
          prev.map(r => (r.id === attemptId ? { ...r, status: 'needs_info' } : r))
        );
      } else {
        setRequests(prev => prev.filter(r => r.id !== attemptId));
      }
      // If we vetted the currently selected item, close the drawer
      if (selectedAttemptId === attemptId) {
        handleCloseDetails();
      }
      router.refresh();
    } else {
      toast.error(res.error || t('toasts.error'));
    }
  };

  const initiateAction = (id: string, decision: 'reject' | 'needs_info') => {
    setSelectedId(id);
    setPendingDecision(decision);
    setNote('');
    setActionDialogOpen(true);
  };

  const submitAction = async () => {
    if (!selectedId || !pendingDecision) return;
    if (!note.trim()) {
      toast.error(t('toasts.note_required'));
      return;
    }
    await handleVerify(selectedId, pendingDecision, note);
    setActionDialogOpen(false);
  };

  const handleDrawerActionComplete = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {initialParams.view === 'queue' && (
        <VerificationKpis
          pending={kpis.pending}
          needsInfo={kpis.needsInfo}
          resubmitted={kpis.resubmitted}
          approved={kpis.approved}
        />
      )}

      {/* Filters */}
      <VerificationFiltersBar
        view={initialParams.view}
        onViewChange={handleViewChange}
        searchQuery={searchQuery}
        onSearchChange={editDraft}
        isFilterPending={pendingKind === 'filter'}
        isBusy={isNavigationPending}
      />

      {/* Table */}
      <VerificationTableV2
        data={requests}
        historyMode={initialParams.view === 'history'}
        onViewDetails={handleSelect}
        onVerify={id => handleVerify(id, 'approve')}
        onAction={initiateAction}
      />

      {/* Action Dialog */}
      <VerificationActionDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        pendingDecision={pendingDecision}
        note={note}
        onNoteChange={setNote}
        onSubmit={submitAction}
      />

      {/* Details Drawer */}
      <VerificationDetailsDrawer
        attemptId={selectedAttemptId}
        isOpen={!!selectedAttemptId}
        onClose={handleCloseDetails}
        onActionComplete={handleDrawerActionComplete}
      />
    </div>
  );
}
