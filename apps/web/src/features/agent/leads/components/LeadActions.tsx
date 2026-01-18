'use client';

import { startPaymentAction } from '@/actions/leads/payment';
import { updateLeadStatusAction } from '@/actions/leads/update';
import { Button } from '@interdomestik/ui';
import { Ban, CheckCircle, Clock, DollarSign, MessageSquare, UserX } from 'lucide-react';
import { toast } from 'sonner';

interface LeadActionsProps {
  leadId: string;
  status: string;
  onUpdate: () => void;
}

export function LeadActions({ leadId, status, onUpdate }: LeadActionsProps) {
  const handleUpdateStatus = async (status: 'contacted' | 'lost' | 'disqualified') => {
    const res = await updateLeadStatusAction({ leadId, status });
    if (res.success) {
      toast.success(`Lead marked as ${status}`);
      onUpdate();
    } else {
      toast.error(res.error || 'Failed to update status');
    }
  };

  const handleCashPayment = async () => {
    const res = await startPaymentAction({
      leadId,
      method: 'cash',
      amountCents: 15000,
      priceId: 'golden_ks_plan_basic',
    });

    if (res.success) {
      toast.success('Cash payment recorded');
      onUpdate();
    } else {
      toast.error(res.error || 'Failed to record payment');
    }
  };

  return (
    <div className="flex justify-end gap-2 items-center">
      {status === 'new' && (
        <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus('contacted')}>
          <MessageSquare className="w-3.5 h-3.5 mr-1" />
          Mark Contacted
        </Button>
      )}

      {['new', 'contacted'].includes(status) && (
        <Button size="sm" variant="outline" onClick={handleCashPayment}>
          <DollarSign className="w-3.5 h-3.5 mr-1" />
          Pay Cash
        </Button>
      )}

      {['new', 'contacted'].includes(status) && (
        <>
          <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus('lost')}>
            <UserX className="w-3.5 h-3.5 mr-1" />
            Mark Lost
          </Button>
          <Button size="sm" variant="ghost" onClick={() => handleUpdateStatus('disqualified')}>
            <Ban className="w-3.5 h-3.5 mr-1" />
            Mark Disqualified
          </Button>
        </>
      )}

      {status === 'payment_pending' && (
        <span className="text-yellow-600 flex items-center text-sm">
          <Clock className="w-3.5 h-3.5 mr-1" /> Waiting Approval
        </span>
      )}

      {status === 'paid' && (
        <span className="text-blue-600 flex items-center text-sm">Setup Required</span>
      )}

      {status === 'converted' && (
        <span className="text-green-600 flex items-center text-sm">
          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Complete
        </span>
      )}

      {['lost', 'disqualified', 'expired'].includes(status) && (
        <span className="text-muted-foreground text-sm flex items-center">
          <UserX className="w-3.5 h-3.5 mr-1" /> Closed
        </span>
      )}
    </div>
  );
}
