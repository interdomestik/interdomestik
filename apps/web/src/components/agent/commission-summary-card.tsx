'use client';

import { CommissionSummary } from '@/actions/commissions';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';

interface CommissionSummaryCardProps {
  summary: CommissionSummary;
  currency?: string;
}

export function CommissionSummaryCard({ summary, currency = 'EUR' }: CommissionSummaryCardProps) {
  const t = useTranslations('Agent.commissions');

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('summary')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-amber-50 p-4 dark:bg-amber-950/20">
            <p className="text-xs text-amber-600 dark:text-amber-400">{t('pending')}</p>
            <p className="text-xl font-semibold text-amber-700 dark:text-amber-300">
              {formatAmount(summary.totalPending)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.pendingCount} {t('items')}
            </p>
          </div>
          <div className="rounded-xl border bg-blue-50 p-4 dark:bg-blue-950/20">
            <p className="text-xs text-blue-600 dark:text-blue-400">{t('approved')}</p>
            <p className="text-xl font-semibold text-blue-700 dark:text-blue-300">
              {formatAmount(summary.totalApproved)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.approvedCount} {t('items')}
            </p>
          </div>
          <div className="rounded-xl border bg-emerald-50 p-4 dark:bg-emerald-950/20">
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{t('paid')}</p>
            <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">
              {formatAmount(summary.totalPaid)}
            </p>
            <p className="text-xs text-muted-foreground">
              {summary.paidCount} {t('items')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
