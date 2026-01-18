import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VerificationStatsProps {
  count: number;
  totalAmount: number;
}

export function VerificationStats({ count, totalAmount }: VerificationStatsProps) {
  const t = useTranslations('admin.leads');

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('stats.count')}</CardTitle>
          <Info className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{count}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{t('stats.total_value')}</CardTitle>
          <span className="text-xs text-muted-foreground">EUR</span>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {(totalAmount / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
