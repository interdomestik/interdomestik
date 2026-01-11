'use client';

import { verifyCashAttemptAction } from '@/actions/leads/verification';
import { type CashVerificationRequestDTO } from '@/actions/leads/verification.core';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@interdomestik/ui';
import { Check, Info, Shield, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function AdminLeadsClient({ initialLeads }: { initialLeads: CashVerificationRequestDTO[] }) {
  // Using 'leads' as variable name for continuity, but these are Attempts DTOs
  const [requests, setRequests] = useState(initialLeads);

  const handleVerify = async (attemptId: string, decision: 'approve' | 'reject') => {
    const res = await verifyCashAttemptAction({
      attemptId,
      decision,
    });

    if (res.success) {
      toast.success(`Payment ${decision}d.`);
      // Optimistic update
      setRequests(prev => prev.filter(r => r.id !== attemptId));
      window.location.reload();
    } else {
      toast.error(res.error || 'Failed to verify payment');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 bg-blue-500/10 border border-blue-500/20 rounded-md max-w-fit">
        <Info className="w-4 h-4" />
        <span>Pending cash verifications affect branch KPIs (Cash Pending). Verify promptly.</span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead>Lead Name</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No pending cash verification requests found.
                </TableCell>
              </TableRow>
            ) : (
              requests.map(req => (
                <TableRow key={req.id} data-testid="cash-verification-row">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{req.branchCode}</span>
                      <span className="text-xs text-muted-foreground">{req.branchName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {req.firstName} {req.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">{req.email}</div>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2 cursor-help">
                            <Shield className="w-3 h-3 text-muted-foreground" />
                            <span className="text-sm">{req.agentName}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Agent Email: {req.agentEmail}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {req.email}
                  </TableCell>
                  <TableCell className="font-bold text-green-600">
                    {(req.amount / 100).toFixed(2)} {req.currency}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => handleVerify(req.id, 'approve')}
                        data-testid="cash-approve"
                      >
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleVerify(req.id, 'reject')}
                        data-testid="cash-reject"
                      >
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
