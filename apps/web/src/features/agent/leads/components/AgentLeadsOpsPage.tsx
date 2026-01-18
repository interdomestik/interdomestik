'use client';

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

  const handleStatusChange = (status: string) => {
    if (!selectedLead) return;
    startTransition(async () => {
      try {
        await updateLeadStatus(selectedLead.id, status);
        toast.success('Status updated');
      } catch (e) {
        toast.error('Failed to update status');
      }
    });
  };

  const handleConvert = () => {
    if (!selectedLead) return;
    startTransition(async () => {
      try {
        await convertLeadToClient(selectedLead.id);
        toast.success('Lead converted successfully');
      } catch (e) {
        toast.error('Failed to convert lead');
      }
    });
  };

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
              <h4 className="mb-2 text-sm font-semibold">Actions</h4>
              <div className="flex gap-2">
                <button
                  className="bg-primary text-primary-foreground px-4 py-2 rounded text-sm disabled:opacity-50"
                  onClick={handleConvert}
                  disabled={isPending || selectedLead.status === 'converted'}
                >
                  {isPending ? 'Processing...' : 'Convert to Client'}
                </button>

                {selectedLead.status !== 'converted' && (
                  <button
                    className="border px-4 py-2 rounded text-sm disabled:opacity-50"
                    onClick={() => handleStatusChange('qualified')}
                    disabled={isPending}
                  >
                    Mark Qualified
                  </button>
                )}
                {selectedLead.status !== 'lost' && (
                  <button
                    className="border border-destructive text-destructive px-4 py-2 rounded text-sm disabled:opacity-50"
                    onClick={() => handleStatusChange('lost')}
                    disabled={isPending}
                  >
                    Mark Lost
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </OpsDrawer>
    </div>
  );
}
