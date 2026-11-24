'use client';

import { getPaymentUpdateUrl } from '@/actions/subscription.core';
import { PADDLE_CLOSED } from '@interdomestik/domain-membership-billing/paddle-closed';
import { Button } from '@interdomestik/ui';
import { CreditCard, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

interface UpdatePaymentButtonProps {
  subscriptionId: string;
  label: string;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
}

export function UpdatePaymentButton({
  subscriptionId,
  label,
  className,
  variant = 'default',
}: UpdatePaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const t = useTranslations('membership');

  if (PADDLE_CLOSED) return <p className="text-sm text-muted-foreground">{t('CLOSED')}</p>;

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const result = await getPaymentUpdateUrl(subscriptionId);
      if (result.error) {
        toast.error(result.error);
      } else if (result.url) {
        // Redirect to Paddle Checkout
        window.location.href = result.url;
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleUpdate} disabled={loading} className={className} variant={variant}>
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <CreditCard className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
