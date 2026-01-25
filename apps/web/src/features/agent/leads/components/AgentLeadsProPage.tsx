'use client';

import { OpsActionBar } from '@/components/ops/OpsActionBar';
import { OpsDrawer } from '@/components/ops/OpsDrawer';
import { OpsFiltersBar, OpsFilterTab } from '@/components/ops/OpsFiltersBar';
import { OpsQueryState } from '@/components/ops/OpsQueryState';
import { OpsStatusBadge } from '@/components/ops/OpsStatusBadge';
import { OpsTable } from '@/components/ops/OpsTable';
import { OpsTimeline } from '@/components/ops/OpsTimeline';
import { getLeadActions, toOpsStatus, toOpsTimelineEvents } from '@/components/ops/adapters/leads';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { convertLeadToClient, updateLeadStatus } from '../actions';

// Pro columns
const columns = [
  { key: 'lead', header: 'Lead Name & Email' },
  { key: 'status', header: 'Status' },
  { key: 'details', header: 'Phone & Branch' },
  { key: 'meta', header: 'Created / Last Touch' },
];

const TABS: OpsFilterTab[] = [
  { id: 'all', label: 'All Leads' },
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'In Progress' },
  { id: 'converted', label: 'Clients' },
  { id: 'lost', label: 'Lost' },
];

export function AgentLeadsProPage({ leads }: { leads: any[] }) {
  const { selectedId, setSelectedId, clearSelectedId } = useOpsSelectionParam();
  const [isPending, startTransition] = useTransition();
  const [showSecondary, setShowSecondary] = useState(false);

  // Local state for filters (in a real app, this might be URL params)
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedLead = leads.find(l => l.id === selectedId);

  // Fallback: If selected ID exists but lead not found, clear selection
  useEffect(() => {
    if (selectedId && leads.length > 0 && !leads.find(l => l.id === selectedId)) {
      clearSelectedId();
    }
  }, [selectedId, leads, clearSelectedId]);

  const handleRowClick = (leadId: string) => {
    setSelectedId(leadId === selectedId ? null : leadId);
  };

  const handleCloseDrawer = () => {
    clearSelectedId();
    setShowSecondary(false);
  };

  const handleAction = (id: string) => {
    if (!selectedLead) return;

    startTransition(async () => {
      try {
        if (id === 'convert') {
          await convertLeadToClient(selectedLead.id);
          toast.success('Lead converted successfully');
        } else if (id === 'mark_contacted') {
          await updateLeadStatus(selectedLead.id, 'contacted');
          toast.success('Lead marked as contacted');
        } else if (id === 'mark_payment_pending') {
          await updateLeadStatus(selectedLead.id, 'payment_pending');
          toast.success('Payment requested');
        } else if (id === 'mark_lost') {
          await updateLeadStatus(selectedLead.id, 'lost');
          toast.success('Lead marked as lost');
        }
      } catch (e) {
        toast.error('Action failed');
      }
    });
  };

  // Get actions from policy
  const { primary, secondary } = getLeadActions(selectedLead);

  // Map to OpsActionBar format (inject onClick and disabled state)
  const mapAction = (config: any) => ({
    ...config,
    onClick: () => handleAction(config.id),
    disabled: isPending || config.disabled,
  });

  // Filter Logic
  const filteredLeads = leads.filter(lead => {
    // 1. Tab Filter
    if (activeTab === 'new' && lead.status !== 'new') return false;
    if (activeTab === 'contacted' && !['contacted', 'payment_pending'].includes(lead.status))
      return false;
    if (activeTab === 'converted' && lead.status !== 'converted') return false;
    if (activeTab === 'lost' && lead.status !== 'lost') return false;

    // 2. Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        lead.firstName?.toLowerCase().includes(q) ||
        lead.lastName?.toLowerCase().includes(q) ||
        lead.email?.toLowerCase().includes(q) ||
        lead.phone?.includes(q);
      if (!matches) return false;
    }

    return true;
  });

  // Map leads to OpsTable rows
  const tableRows = filteredLeads.map(lead => {
    return {
      id: lead.id,
      cells: [
        <div key="lead" className="flex flex-col py-1">
          <span className="font-medium text-foreground">
            {lead.firstName} {lead.lastName}
          </span>
          <span className="text-sm text-muted-foreground">{lead.email}</span>
        </div>,
        <div key="status">
          <OpsStatusBadge {...toOpsStatus(lead.status)} />
        </div>,
        <div key="details" className="flex flex-col text-sm">
          <span>{lead.phone || '-'}</span>
          <span className="text-xs text-muted-foreground">
            {lead.branch?.name || lead.branchId || ''}
          </span>
        </div>,
        <div key="meta" className="flex flex-col text-sm text-muted-foreground">
          <span>{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}</span>
          <span className="text-xs">
            {/* Abstracting "Last Touch" as updated at for now */}
            {lead.updatedAt ? `Updated ${new Date(lead.updatedAt).toLocaleDateString()}` : ''}
          </span>
        </div>,
      ],
      onClick: () => handleRowClick(lead.id),
      testId: `lead-row-${lead.id}`,
    };
  });

  return (
    <div className="h-full flex flex-col space-y-4 p-4" data-testid="agent-leads-pro">
      {/* Header / Nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/agent/workspace">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="agent-pro-back-button"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Leads Worklist (Pro)</h1>
            <p className="text-sm text-muted-foreground">Manage and track all your leads.</p>
          </div>
        </div>
        <Link href="/agent/leads">
          <Button variant="outline" size="sm">
            Switch to Lite
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <OpsFiltersBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search leads by name, email, or phone..."
        searchInputTestId="leads-pro-search"
      />

      <div className="flex-1 overflow-hidden border rounded-lg bg-card">
        <OpsQueryState
          isEmpty={filteredLeads.length === 0}
          emptyTitle="No leads found"
          emptySubtitle="Adjust your filters or search query."
        >
          <OpsTable
            columns={columns}
            rows={tableRows}
            emptyLabel="No leads match your filters"
            rowTestId="lead-row"
          />
        </OpsQueryState>
      </div>

      <OpsDrawer
        open={!!selectedId}
        onOpenChange={open => !open && handleCloseDrawer()}
        title={selectedLead ? `${selectedLead.firstName} ${selectedLead.lastName}` : 'Lead Details'}
      >
        {selectedLead && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <OpsStatusBadge {...toOpsStatus(selectedLead.status)} />
              </div>
              <div className="text-right space-y-1">
                {/* Reusing details view similar to OpsPage but can be expanded */}
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <span className="text-sm" data-testid="lead-created-at">
                  {selectedLead.createdAt
                    ? new Date(selectedLead.createdAt).toLocaleDateString()
                    : '-'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
              <div>
                <span className="block text-muted-foreground">Email</span>
                <span className="font-medium">{selectedLead.email}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Phone</span>
                <span className="font-medium">{selectedLead.phone || '-'}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Source</span>
                <span className="font-medium capitalize">{selectedLead.source || '-'}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Branch</span>
                <span className="font-medium">
                  {selectedLead.branch?.name || selectedLead.branchId || '-'}
                </span>
              </div>
            </div>

            {selectedLead.notes && (
              <div className="border-t pt-4">
                <span className="block text-sm font-medium text-muted-foreground mb-2">Notes</span>
                <p className="text-sm bg-muted/50 p-3 rounded-md">{selectedLead.notes}</p>
              </div>
            )}

            {/* Standard Ops Actions (Flat list for Pro, or reuse guided? Reusing guided is safer for consistency) */}
            {primary && (
              <div className="border-t pt-4" data-testid="agent-lead-next-step">
                <span className="block text-sm font-medium text-muted-foreground mb-3">
                  Next Step
                </span>
                <OpsActionBar
                  primary={!!primary ? mapAction(primary) : undefined}
                  className="pt-0 border-0 mt-0"
                  align="start"
                />
              </div>
            )}

            {secondary.length > 0 && (
              <div className="border-t pt-4">
                <button
                  onClick={() => setShowSecondary(!showSecondary)}
                  className="flex items-center justify-between w-full text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  More Actions
                  {showSecondary ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
                {showSecondary && (
                  <div className="mt-4 animate-in slide-in-from-top-2 duration-200">
                    <OpsActionBar
                      secondary={secondary.map(mapAction)}
                      className="pt-0 border-0 mt-0"
                      align="start"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="border-t pt-4">
              <OpsTimeline
                title="Timeline"
                events={toOpsTimelineEvents(selectedLead)}
                emptyLabel="No events yet"
              />
            </div>
          </div>
        )}
      </OpsDrawer>
    </div>
  );
}
