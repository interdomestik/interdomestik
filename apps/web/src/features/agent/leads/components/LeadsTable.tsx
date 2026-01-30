import { OpsStatusBadge, OpsTable, toOpsBadgeVariant } from '@/components/ops';
import { LeadActions } from './LeadActions';

export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

interface LeadsTableProps {
  leads: Lead[];
  isLoading?: boolean;
  onUpdate: () => void;
}

export function LeadsTable({ leads, isLoading, onUpdate }: LeadsTableProps) {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'status', header: 'Status' },
  ];

  const rows = leads.map(lead => ({
    id: lead.id,
    cells: [
      `${lead.firstName} ${lead.lastName}`,
      lead.email,
      <OpsStatusBadge
        key="status"
        variant={toOpsBadgeVariant(lead.status)}
        label={lead.status.charAt(0).toUpperCase() + lead.status.slice(1).replace('_', ' ')}
      />,
    ],
    actions: <LeadActions leadId={lead.id} status={lead.status} onUpdate={onUpdate} />,
  }));

  return (
    <OpsTable
      columns={columns}
      rows={rows}
      loading={isLoading}
      loadingLabel="Searching..."
      emptyLabel="No leads found."
      actionsHeader="Next Action"
      rowTestId="lead-row"
    />
  );
}
