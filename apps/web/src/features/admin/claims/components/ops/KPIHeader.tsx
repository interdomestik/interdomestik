// Phase 2.7: KPI Header Component
'use client';

import { Button } from '@interdomestik/ui';
import { AlertTriangle, Clock, Inbox, RefreshCw, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import type { OperationalKPIs } from '../../types';
import { KPICard } from './KPICard';

interface KPIHeaderProps {
  kpis: OperationalKPIs;
  fetchedAt: string;
}

/**
 * KPIHeader — Sticky header with operational KPIs.
 * Shows 4 primary KPIs + data age indicator + refresh button.
 */
export function KPIHeader({ kpis, fetchedAt }: KPIHeaderProps) {
  const t = useTranslations('admin.claims_page.ops_center');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Update data age every second (client timer, no re-fetch)
  useEffect(() => {
    const updateAge = () => {
      setSecondsAgo(Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000));
    };
    updateAge();
    const interval = setInterval(updateAge, 1000);
    return () => clearInterval(interval);
  }, [fetchedAt]);

  // Refresh: reset page=0 and clear poolAnchor
  const handleRefresh = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    params.delete('poolAnchor');
    router.push(`${pathname}?${params.toString()}`);
    router.refresh();
  }, [router, pathname, searchParams]);

  return (
    <div
      className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-white/5 py-4"
      data-testid="kpi-header"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <KPICard
            label={t('kpi.sla_breach')}
            value={kpis.slaBreach}
            icon={Clock}
            variant={kpis.slaBreach > 0 ? 'danger' : 'default'}
            testId="kpi-sla-breach"
          />
          <KPICard
            label={t('kpi.unassigned')}
            value={kpis.unassigned}
            icon={Users}
            variant={kpis.unassigned > 0 ? 'warning' : 'default'}
            testId="kpi-unassigned"
          />
          <KPICard
            label={t('kpi.stuck')}
            value={kpis.stuck}
            icon={AlertTriangle}
            variant={kpis.stuck > 0 ? 'warning' : 'default'}
            testId="kpi-stuck"
          />
          <KPICard
            label={t('kpi.total_open')}
            value={kpis.totalOpen}
            icon={Inbox}
            testId="kpi-total-open"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground" data-testid="kpi-data-age">
            {t('data_age', { seconds: secondsAgo })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            data-testid="refresh-button"
            title={t('refresh')}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
