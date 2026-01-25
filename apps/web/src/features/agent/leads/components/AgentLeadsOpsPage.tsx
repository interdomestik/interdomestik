'use client';

import { OpsActionBar } from '@/components/ops/OpsActionBar';
import { OpsDrawer } from '@/components/ops/OpsDrawer';
import { OpsQueryState } from '@/components/ops/OpsQueryState';
import { OpsStatusBadge } from '@/components/ops/OpsStatusBadge';
import { OpsTable } from '@/components/ops/OpsTable';
import { OpsTimeline } from '@/components/ops/OpsTimeline';
import { getLeadActions, toOpsStatus, toOpsTimelineEvents } from '@/components/ops/adapters/leads';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { CreateLeadDialog } from './CreateLeadDialog';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { convertLeadToClient, updateLeadStatus } from '../actions';
import { startPaymentAction } from '@/actions/leads/payment';

// Lite columns
const columns = [
  { key: 'lead', header: 'Lead' },
  { key: 'status', header: 'Status & Next Step' },
];

export function AgentLeadsOpsPage({ leads }: { leads: any[] }) {
  const router = useRouter();
  const { selectedId, setSelectedId, clearSelectedId } = useOpsSelectionParam();
  const [isPending, startTransition] = useTransition();
  const [showSecondary, setShowSecondary] = useState(false);

  const selectedLead = leads.find(l => l.id === selectedId);

  const handleRefresh = () => {
    router.refresh();
  };

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
        } else if (id === 'pay_cash') {
          const res = await startPaymentAction({
            leadId: selectedLead.id,
            method: 'cash',
            amountCents: 15000,
            priceId: 'golden_ks_plan_basic',
          });
          if (res.success) {
            toast.success('Cash payment recorded');
          } else {
            throw new Error(res.error);
          }
        } else if (id === 'mark_lost') {
          await updateLeadStatus(selectedLead.id, 'lost');
          toast.success('Lead marked as lost');
        }
        handleRefresh();
      } catch (e: any) {
        toast.error(e.message || 'Action failed');
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
    testId: config.testId || `${config.id}-button`,
  });

  // Map leads to OpsTable rows
  const tableRows = leads.map(lead => {
    const { primary: rowPrimary, secondary: rowSecondary } = getLeadActions(lead);
    const nextActionLabel = rowPrimary?.label || rowSecondary[0]?.label || null;

    return {
      id: lead.id,
      cells: [
        <div key="lead" className="flex flex-col py-1">
          <span className="font-medium text-foreground">
            {lead.firstName} {lead.lastName}
          </span>
          <span className="text-sm text-muted-foreground">{lead.email}</span>
        </div>,
        <div key="status" className="flex items-center gap-3">
          <OpsStatusBadge {...toOpsStatus(lead.status)} />
          {nextActionLabel && lead.status !== 'converted' && lead.status !== 'lost' && (
            <span className="text-xs font-medium text-primary animate-pulse">
              → {nextActionLabel}
            </span>
          )}
        </div>,
      ],
      onClick: () => handleRowClick(lead.id),
      testId: `lead-row-${lead.id}`,
      dataAttributes: {
        'data-email': lead.email,
      },
    };
  });

  return (
    <div className="h-full flex flex-col" data-testid="agent-leads-lite">
      <div className="p-4 pb-0 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Leads</h1>
        <CreateLeadDialog onSuccess={handleRefresh} />
      </div>
      <div className="flex-1 overflow-hidden p-4">
        <OpsQueryState
          isEmpty={leads.length === 0}
          emptyTitle="No leads found"
          emptySubtitle="Get started by creating a new lead or waiting for incoming leads."
        >
          <OpsTable
            columns={columns}
            rows={tableRows}
            emptyLabel="No leads found"
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

            {/* Guided Next Step */}
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

            {/* Secondary Actions (Collapsible) */}
            {secondary.length > 0 && (
              <div className="border-t pt-4">
                <button
                  onClick={() => setShowSecondary(!showSecondary)}
                  data-testid="more-actions-button"
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
