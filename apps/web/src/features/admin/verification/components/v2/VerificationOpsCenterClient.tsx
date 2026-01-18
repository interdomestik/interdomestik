'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useOpsSelectionParam, trackOpsEvent } from '@/components/ops';
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
    clearSelectedId: handleCloseDetails,
  } = useOpsSelectionParam();

  const handleSelect = (id: string) => {
    trackOpsEvent({ surface: 'verification', action: 'select', entityId: id });
    baseSetSelectedId(id);
  };

  const [requests, setRequests] = useState(initialData);

  // Search State
  const [searchQuery, setSearchQuery] = useState(initialParams.query);

  // Sync prop to state
  useEffect(() => {
    setRequests(initialData);
  }, [initialData]);

  // Action Dialog State
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<'reject' | 'needs_info' | null>(null);
  const [note, setNote] = useState('');

  // Search Debounce
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const handleSearch = (term: string) => {
    setSearchQuery(term);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (term) params.set('query', term);
      else params.delete('query');
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
  };

  const handleViewChange = (view: 'queue' | 'history') => {
    const params = new URLSearchParams(searchParams);
    params.set('view', view);
    params.delete('selected'); // Clear selection on view change
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Derive KPIs from data
  const kpis = useMemo(() => {
    const pending = requests.filter(r => r.status === 'pending' && !r.isResubmission).length;
    const needsInfo = requests.filter(r => r.status === 'needs_info').length;
    const resubmitted = requests.filter(r => r.isResubmission && r.status === 'pending').length;
    const approved = requests.filter(r => r.status === 'succeeded').length;
    const totalValue = requests.reduce((sum, r) => sum + r.amount, 0);
    return { pending, needsInfo, resubmitted, approved, totalValue };
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
          totalValue={kpis.totalValue}
        />
      )}

      {/* Filters */}
      <VerificationFiltersBar
        view={initialParams.view}
        onViewChange={handleViewChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
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
