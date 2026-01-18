import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@interdomestik/ui';
import { LeadActions } from './LeadActions';
import { StatusBadge } from './StatusBadge';

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
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Next Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center">
                Searching...
              </TableCell>
            </TableRow>
          ) : leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                No leads found.
              </TableCell>
            </TableRow>
          ) : (
            leads.map(lead => (
              <TableRow key={lead.id}>
                <TableCell className="font-medium">
                  {lead.firstName} {lead.lastName}
                </TableCell>
                <TableCell>{lead.email}</TableCell>
                <TableCell>
                  <StatusBadge status={lead.status} />
                </TableCell>
                <TableCell className="text-right">
                  <LeadActions leadId={lead.id} status={lead.status} onUpdate={onUpdate} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
