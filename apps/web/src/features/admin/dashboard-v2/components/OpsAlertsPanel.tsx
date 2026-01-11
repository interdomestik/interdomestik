'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { AlertCircle, Bell, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DashboardV2Data } from '../server/getTenantAdminDashboardV2Data';

export function OpsAlertsPanel({
  alerts,
  colSpan,
}: {
  alerts: DashboardV2Data['alerts'];
  colSpan?: number;
}) {
  const t = useTranslations('admin.dashboard_v2.alerts');

  return (
    <GlassCard
      className={`p-0 overflow-hidden flex flex-col h-full col-span-12 md:col-span-${colSpan ?? 12}`}
    >
      <div className="p-4 border-b border-white/10 flex flex-col gap-1 bg-rose-500/5">
        <h3 className="font-semibold text-lg flex items-center gap-2 text-rose-500">
          <AlertCircle className="h-4 w-4" />
          {t('title')}
        </h3>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="p-4 space-y-3 flex-1">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 min-h-[200px]">
            <Bell className="h-8 w-8 opacity-20" />
            <span className="text-sm">{t('all_clear')}</span>
          </div>
        ) : (
          alerts.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-md text-sm flex gap-3 ${
                alert.type === 'critical'
                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-200'
                  : alert.type === 'warning'
                    ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200'
                    : 'bg-blue-500/10 border border-blue-500/20 text-blue-200'
              }`}
            >
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-medium">{alert.message}</span>
                <span className="text-[10px] opacity-70">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}
