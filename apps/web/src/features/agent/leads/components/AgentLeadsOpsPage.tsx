'use client';

import { getLeadActions } from '@/components/ops/adapters/leads';
import { OpsActionBar } from '@/components/ops/OpsActionBar';
import { OpsDrawer } from '@/components/ops/OpsDrawer';
import { OpsTable } from '@/components/ops/OpsTable';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { useEffect, useTransition } from 'react';
import { toast } from 'sonner';
import { convertLeadToClient, updateLeadStatus } from '../actions';

// Mock columns for now or import from definition if available
// Assuming leads schema: name, email, phone, status, source
const columns = [
  { key: 'firstName', header: 'First Name' },
  { key: 'lastName', header: 'Last Name' },
  { key: 'email', header: 'Email' },
  { key: 'status', header: 'Status' },
  { key: 'source', header: 'Source' },
];

export function AgentLeadsOpsPage({ leads }: { leads: any[] }) {
  const { selectedId, setSelectedId, clearSelectedId } = useOpsSelectionParam();
  const [isPending, startTransition] = useTransition();

  const selectedLead = leads.find(l => l.id === selectedId);

  // Fallback: If invalid selection (and leads exist), select first
  useEffect(() => {
    if (leads.length > 0 && (!selectedId || !leads.find(l => l.id === selectedId))) {
      setSelectedId(leads[0].id);
    }
  }, [selectedId, leads, setSelectedId]);

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
        } else if (id === 'mark_qualified') {
          await updateLeadStatus(selectedLead.id, 'qualified');
          toast.success('Status updated');
        } else if (id === 'mark_lost') {
          await updateLeadStatus(selectedLead.id, 'lost');
          toast.success('Status updated');
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

  // Map leads to OpsTable rows
  const tableRows = leads.map(lead => ({
    id: lead.id,
    cells: [
      lead.firstName,
      lead.lastName,
      lead.email,
      <span key="status" className="capitalize">
        {lead.status}
      </span>,
      <span key="source" className="capitalize">
        {lead.source}
      </span>,
    ],
    onClick: () => handleRowClick(lead.id),
  }));

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-hidden p-4">
        <OpsTable columns={columns} rows={tableRows} emptyLabel="No leads found" />
      </div>

      <OpsDrawer
        open={!!selectedId}
        onOpenChange={open => !open && handleCloseDrawer()}
        title={selectedLead ? `${selectedLead.firstName} ${selectedLead.lastName}` : 'Lead Details'}
      >
        {selectedLead && (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">Manage lead information and status.</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-muted-foreground">Email</span>
                <span className="font-medium">{selectedLead.email}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Phone</span>
                <span className="font-medium">{selectedLead.phone || '-'}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{selectedLead.status}</span>
              </div>
              <div>
                <span className="block text-muted-foreground">Source</span>
                <span className="font-medium capitalize">{selectedLead.source}</span>
              </div>
            </div>

            <div className="border-t pt-4">
              <OpsActionBar
                primary={primary ? mapAction(primary) : undefined}
                secondary={secondary.map(mapAction)}
              />
            </div>
          </div>
        )}
      </OpsDrawer>
    </div>
  );
}
