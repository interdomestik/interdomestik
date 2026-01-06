'use client';

import {
  getAllCommissions,
  getGlobalCommissionSummary,
  updateCommissionStatus,
} from '@/actions/commissions.admin';
import { Commission, CommissionStatus, CommissionSummary } from '@/actions/commissions.types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { format } from 'date-fns';
import { Check, Clock, DollarSign } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';

export default function AdminCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [summary, setSummary] = useState<CommissionSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [commResult, sumResult] = await Promise.all([
      getAllCommissions(),
      getGlobalCommissionSummary(),
    ]);
    if (commResult.success && commResult.data) setCommissions(commResult.data);
    if (sumResult.success && sumResult.data) setSummary(sumResult.data);
  }

  function handleStatusChange(id: string, newStatus: CommissionStatus) {
    startTransition(async () => {
      const result = await updateCommissionStatus(id, newStatus);
      if (result.success) loadData();
    });
  }

  const formatAmount = (amount: string, currency = 'EUR') => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(
      Number.parseFloat(amount)
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Commission Management</h1>
        <p className="text-muted-foreground">Review and process agent commissions</p>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalPending.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{summary.pendingCount} items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-muted-foreground">Approved</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalApproved.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{summary.approvedCount} items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">Paid</span>
              </div>
              <p className="text-2xl font-bold">€{summary.totalPaid.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{summary.paidCount} items</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Total Owed</span>
              </div>
              <p className="text-2xl font-bold">
                €{(summary.totalPending + summary.totalApproved).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.pendingCount + summary.approvedCount} items
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Commissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {commissions.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No commissions yet</p>
            ) : (
              commissions.map(c => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-1">
                    <p className="font-medium">{c.agentName}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.memberName || 'Unknown Member'} • {c.type.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.earnedAt ? format(new Date(c.earnedAt), 'PPP') : '-'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-lg">{formatAmount(c.amount)}</span>
                    <Select
                      value={c.status}
                      onValueChange={v => handleStatusChange(c.id, v as CommissionStatus)}
                      disabled={isPending}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="void">Void</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
