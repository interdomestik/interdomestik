'use client';

import { verifyCashAction } from '@/actions/leads/verify';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@interdomestik/ui';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function AdminLeadsClient({ initialLeads }: { initialLeads: any[] }) {
  const [leads] = useState(initialLeads);

  const handleVerify = async (lead: any, decision: 'approve' | 'reject') => {
    // Find the pending payment attempt
    const attempt = lead.leadPaymentAttempts?.find(
      (p: any) => p.status === 'pending' && p.method === 'cash'
    );

    if (!attempt) {
      toast.error('No pending cash attempt found.');
      return;
    }

    const res = await verifyCashAction({
      leadId: lead.id,
      paymentAttemptId: attempt.id,
      decision,
    });

    if (res.success) {
      toast.success(`Payment ${decision}d.`);
      window.location.reload();
    } else {
      toast.error(res.error || 'Failed to verify payment');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>First Name</TableHead>
              <TableHead>Last Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Verification</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No pending cash payments found.
                </TableCell>
              </TableRow>
            ) : (
              leads.map(lead => {
                const attempt = lead.leadPaymentAttempts?.find((p: any) => p.status === 'pending');
                return (
                  <TableRow key={lead.id}>
                    <TableCell>{lead.firstName}</TableCell>
                    <TableCell>{lead.lastName}</TableCell>
                    <TableCell>{lead.email}</TableCell>
                    <TableCell>
                      {attempt ? `${(attempt.amount / 100).toFixed(2)} ${attempt.currency}` : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-600 hover:bg-green-50"
                          onClick={() => handleVerify(lead, 'approve')}
                        >
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleVerify(lead, 'reject')}
                        >
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
