'use client';

import { Commission } from '@/actions/commissions';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { format } from 'date-fns';
import { Briefcase, Clock, RefreshCw, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

const typeIcons: Record<string, React.ReactNode> = {
  new_membership: <TrendingUp className="h-4 w-4" />,
  renewal: <RefreshCw className="h-4 w-4" />,
  upgrade: <TrendingUp className="h-4 w-4" />,
  b2b: <Briefcase className="h-4 w-4" />,
};

const statusColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  void: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
};

interface CommissionsListProps {
  commissions: Commission[];
  currency?: string;
}

export function CommissionsList({ commissions, currency = 'EUR' }: CommissionsListProps) {
  const t = useTranslations('Agent.commissions');

  const formatAmount = (amount: string) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency,
    }).format(parseFloat(amount));
  };

  if (commissions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Clock className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">{t('noCommissions')}</p>
          <p className="text-xs text-muted-foreground/70">{t('noCommissionsHint')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('recentCommissions')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {commissions.map(c => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                {typeIcons[c.type] || <TrendingUp className="h-4 w-4" />}
              </div>
              <div>
                <p className="font-medium">{c.memberName || 'Unknown Member'}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`types.${c.type}`)} • {c.earnedAt ? format(new Date(c.earnedAt), 'PPP') : '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge className={statusColors[c.status]}>{t(`status.${c.status}`)}</Badge>
              <span className="font-semibold">{formatAmount(c.amount)}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
