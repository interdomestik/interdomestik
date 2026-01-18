'use client';

import { Card, CardContent } from '@interdomestik/ui';
import { AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VerificationKpisProps {
  pending: number;
  needsInfo: number;
  resubmitted: number;
  approved: number;
  totalValue: number;
}

export function VerificationKpis({
  pending,
  needsInfo,
  resubmitted,
  approved,
  totalValue,
}: VerificationKpisProps) {
  const t = useTranslations('admin.leads.kpis');

  const kpis = [
    {
      label: t('pending'),
      value: pending,
      icon: Clock,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: t('needs_info'),
      value: needsInfo,
      icon: AlertTriangle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      label: t('resubmitted'),
      value: resubmitted,
      icon: RefreshCw,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: t('approved'),
      value: approved,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="verification-kpis">
      {kpis.map(kpi => {
        const Icon = kpi.icon;
        return (
          <Card key={kpi.label} className="bg-card/50 backdrop-blur-sm border-white/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">
                    {kpi.label}
                  </span>
                  <span className="text-2xl font-bold tabular-nums">{kpi.value}</span>
                </div>
                <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
