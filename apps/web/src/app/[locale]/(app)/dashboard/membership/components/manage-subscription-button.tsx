'use client';

import { cancelSubscription, getPaymentUpdateUrl } from '@/actions/subscription';
import { Button } from '@interdomestik/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@interdomestik/ui/components/dropdown-menu';
import { Ban, CreditCard, Loader2, Settings } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ManageSubscriptionButtonProps {
  subscriptionId: string;
  labels: {
    manage: string;
    updatePayment: string;
    cancel: string;
    cancelConfirm: string;
  };
}

export function ManageSubscriptionButton({
  subscriptionId,
  labels,
}: ManageSubscriptionButtonProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleUpdatePayment = async () => {
    setLoading('payment');
    try {
      const result = await getPaymentUpdateUrl(subscriptionId);
      if (result.error) {
        toast.error(result.error);
        setLoading(null);
      } else if (result.url) {
        // Redirecting, keep loading
        window.location.href = result.url;
      }
    } catch {
      toast.error('Failed to initiate payment update');
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm(labels.cancelConfirm)) return;
    setLoading('cancel');
    try {
      const result = await cancelSubscription(subscriptionId);
      if (result.error) {
        toast.error(result.error);
        setLoading(null);
      } else {
        toast.success('Subscription scheduled for cancellation');
        // Refresh to show updated status if optimistic update isn't enough
        window.location.reload();
      }
    } catch {
      toast.error('Failed to cancel subscription');
      setLoading(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={!!loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Settings className="mr-2 h-4 w-4" />
          )}
          {labels.manage}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleUpdatePayment} disabled={!!loading}>
          <CreditCard className="mr-2 h-4 w-4" />
          {labels.updatePayment}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleCancel}
          disabled={!!loading}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Ban className="mr-2 h-4 w-4" />
          {labels.cancel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
