import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { XCircle } from 'lucide-react';

import { UpdatePaymentButton } from './update-payment-button';

interface LockedStateBannerProps {
  readonly subscriptionId: string;
  readonly t: (key: string) => string;
}

export function LockedStateBanner({ subscriptionId, t }: LockedStateBannerProps) {
  return (
    <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4 dark:bg-red-950/30">
      <div className="flex items-start gap-3">
        <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
            {t('dunning.suspended_title')}
          </h3>
          <p className="mt-2 text-red-700 dark:text-red-300">{t('dunning.suspended_message')}</p>
          <div className="mt-4 flex gap-2">
            <UpdatePaymentButton
              subscriptionId={subscriptionId}
              label={t('dunning.update_payment_button')}
            />
            <Button variant="outline" asChild>
              <Link href="/pricing">{t('plan.view_plans_button')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
