'use client';

import { HealthExplanationTooltip } from '@/components/health/health-explanation-tooltip';
import { GlassCard } from '@/components/ui/glass-card';
import { HealthProfile, severityStyles } from '@/features/admin/health/health-model';
import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface BranchDashboardHeaderProps {
  branch: {
    name: string;
    code: string;
    isActive: boolean;
  };
  health: HealthProfile;
}

export function BranchDashboardHeader({ branch, health }: Readonly<BranchDashboardHeaderProps>) {
  const t = useTranslations('admin.branches');
  const styles = severityStyles(health.severity);

  return (
    <GlassCard
      className={cn(
        'min-w-0 p-4 sm:p-6 border-l-4 flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:justify-between',
        styles.border
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1
            className="min-w-0 text-2xl font-bold tracking-tight [overflow-wrap:anywhere]"
            data-testid="branch-dashboard-title"
          >
            {branch.name}
          </h1>
          <Badge
            variant="outline"
            className="max-w-full font-mono text-xs opacity-70 [overflow-wrap:anywhere]"
          >
            {branch.code}
          </Badge>
          {!branch.isActive && <Badge variant="secondary">{t('status.inactive')}</Badge>}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t('view_dashboard_subtitle')}</span>
        </div>
      </div>

      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
        <HealthExplanationTooltip severity={health.severity} subject="branch">
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
            <div className="flex min-w-0 flex-col items-end">
              <span className={cn('text-sm font-medium', styles.text)}>{t(health.labelKey)}</span>
              <span className="text-xs text-muted-foreground" data-testid="branch-health-score">
                {t('health_score', { score: health.score })}
              </span>
            </div>

            <div
              className={cn(
                'flex items-center justify-center w-12 h-12 shrink-0 rounded-full border-4 text-lg font-bold shadow-sm',
                styles.border,
                styles.text,
                'bg-background'
              )}
              data-testid="health-score"
            >
              {health.score}
            </div>
          </div>
        </HealthExplanationTooltip>
      </div>
    </GlassCard>
  );
}
