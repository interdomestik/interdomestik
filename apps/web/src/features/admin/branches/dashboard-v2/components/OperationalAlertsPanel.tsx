'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface OperationalAlertsPanelProps {
  alerts: {
    cashPending: number;
    slaBreaches: number;
  };
}

export function OperationalAlertsPanel({ alerts }: OperationalAlertsPanelProps) {
  const t = useTranslations('admin.branches.alerts');
  const hasAlerts = alerts.cashPending > 0 || alerts.slaBreaches > 0;

  return (
    <GlassCard className="h-full flex flex-col">
      <div className="p-4 border-b border-border/50">
        <h3 className="font-semibold">{t('title')}</h3>
      </div>
      <div className="p-4 flex-1">
        {!hasAlerts ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 min-h-[100px]">
            <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
            <p className="text-sm">{t('no_alerts')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.slaBreaches > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">{t('sla_breach_title')}</p>
                  <p className="opacity-90">
                    {t('sla_breach_desc', { count: alerts.slaBreaches })}
                  </p>
                </div>
              </div>
            )}
            {alerts.cashPending > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium">{t('cash_pending_title')}</p>
                  <p className="opacity-90">
                    {t('cash_pending_desc', { count: alerts.cashPending })}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
