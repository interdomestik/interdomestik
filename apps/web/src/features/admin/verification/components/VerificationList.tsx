'use client';

import { Tabs, TabsContent } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { verifyCashAttemptAction } from '../actions/verification';
import { type CashVerificationRequestDTO } from '../server/types';
import { VerificationActionDialog } from './VerificationActionDialog';
import { VerificationDetailsDrawer } from './VerificationDetailsDrawer';
import { VerificationFilters } from './VerificationFilters';
import { VerificationStats } from './VerificationStats';
import { VerificationTable } from './VerificationTable';

export function VerificationList({
  initialLeads,
  initialParams,
}: {
  initialLeads: CashVerificationRequestDTO[];
  initialParams: { view: 'queue' | 'history'; query: string };
}) {
  const t = useTranslations('admin.leads');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [requests, setRequests] = useState(initialLeads);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);

  // Sync prop to state
  useEffect(() => {
    setRequests(initialLeads);
  }, [initialLeads]);

  // Action Dialog State (Needs Info / Reject)
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<'reject' | 'needs_info' | null>(null);
  const [note, setNote] = useState('');

  // Search Debounce
  const debounceRef = useRef<NodeJS.Timeout>(null);
  const handleSearch = (term: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (term) params.set('query', term);
      else params.delete('query');
      router.replace(`${pathname}?${params.toString()}`);
    }, 300);
  };

  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', val);
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Derive unique branches for filter
  const branches = useMemo(() => {
    const unique = new Map();
    requests.forEach(r => {
      unique.set(r.branchId, r.branchName);
    });
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    if (branchFilter === 'all') return requests;
    return requests.filter(r => r.branchId === branchFilter);
  }, [requests, branchFilter]);

  const totalAmount = filteredRequests.reduce((sum, r) => sum + r.amount, 0);

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
      toast.success(t(`toasts.${decision}_success`));
      if (decision === 'needs_info') {
        setRequests(prev =>
          prev.map(r => (r.id === attemptId ? { ...r, status: 'needs_info' } : r))
        );
      } else {
        setRequests(prev => prev.filter(r => r.id !== attemptId));
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
      {/* Stats */}
      <VerificationStats count={filteredRequests.length} totalAmount={totalAmount} />

      <div className="flex flex-col gap-4">
        <Tabs defaultValue={initialParams.view} onValueChange={handleTabChange} className="w-full">
          {/* Filters & Tabs List */}
          <VerificationFilters
            view={initialParams.view}
            onViewChange={handleTabChange}
            searchQuery={initialParams.query}
            onSearchChange={handleSearch}
            branchFilter={branchFilter}
            onBranchFilterChange={setBranchFilter}
            branches={branches}
          />

          <TabsContent value="queue" className="mt-0">
            <VerificationTable
              data={filteredRequests}
              historyMode={false}
              onViewDetails={setSelectedAttemptId}
              onVerify={(id, _) => handleVerify(id, 'approve')} // Simplified signature binding
              onAction={initiateAction}
            />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <VerificationTable
              data={filteredRequests}
              historyMode={true}
              onViewDetails={setSelectedAttemptId}
              onVerify={(id, _) => handleVerify(id, 'approve')}
              onAction={initiateAction}
            />
          </TabsContent>
        </Tabs>
      </div>

      <VerificationActionDialog
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        pendingDecision={pendingDecision}
        note={note}
        onNoteChange={setNote}
        onSubmit={submitAction}
      />

      <VerificationDetailsDrawer
        attemptId={selectedAttemptId}
        isOpen={!!selectedAttemptId}
        onClose={() => setSelectedAttemptId(null)}
        onActionComplete={handleDrawerActionComplete}
      />
    </div>
  );
}
