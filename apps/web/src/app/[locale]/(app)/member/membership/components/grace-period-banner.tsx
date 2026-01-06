import { AlertTriangle } from 'lucide-react';

import { UpdatePaymentButton } from './update-payment-button';

interface GracePeriodBannerProps {
  daysRemaining: number;
  gracePeriodEndsAt: Date | null;
  subscriptionId: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}

export function GracePeriodBanner({
  daysRemaining,
  gracePeriodEndsAt,
  subscriptionId,
  t,
}: GracePeriodBannerProps) {
  return (
    <div className="rounded-lg border-2 border-orange-500 bg-orange-50 p-4 dark:bg-orange-950/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-200">
            {t('dunning.payment_failed_title', { daysRemaining })}
          </h3>
          <p className="mt-2 text-orange-700 dark:text-orange-300">
            {t('dunning.payment_failed_message')}
          </p>
          <p className="mt-2 text-sm text-orange-600">
            {t('dunning.grace_period_ends', {
              date: gracePeriodEndsAt?.toLocaleDateString() || '',
            })}
          </p>
          <UpdatePaymentButton
            subscriptionId={subscriptionId}
            label={t('dunning.update_payment_button')}
            className="mt-4 bg-orange-600 hover:bg-orange-700"
          />
        </div>
      </div>
    </div>
  );
}
