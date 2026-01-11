import type { BranchMetadata, BranchStats } from '@/actions/branch-dashboard.types';
import { getRiskProfile } from '@/features/admin/branches/utils/branch-risk';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { cn } from '@interdomestik/ui/lib/utils';
import { Activity, Building2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface BranchHeaderProps {
  branch: BranchMetadata;
  stats: BranchStats;
}

export async function BranchHeader({ branch, stats }: BranchHeaderProps) {
  const t = await getTranslations('admin.branches');
  const risk = getRiskProfile(stats.severity);

  return (
    <Card className={cn('border-l-4 transition-all', risk.colorClass)}>
      <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-lg',
              branch.isActive ? 'bg-primary/10' : 'bg-muted'
            )}
          >
            <Building2
              className={cn('h-6 w-6', branch.isActive ? 'text-primary' : 'text-muted-foreground')}
            />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle as="h1" className="text-2xl">
                {branch.name}
              </CardTitle>
              <Badge variant="outline" className={cn(risk.badgeClass)}>
                {t(risk.labelKey)}
              </Badge>
              {!branch.isActive && (
                <Badge variant="secondary">{t('dashboard.status_inactive')}</Badge>
              )}
            </div>
            {branch.code && (
              <CardDescription className="mt-1">
                {t('dashboard.code_label')}: {branch.code}
              </CardDescription>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {branch.isActive && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <span>{t('health_score', { score: stats.healthScore })}</span>
              </div>
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-500',
                    stats.healthScore > 80
                      ? 'bg-emerald-500'
                      : stats.healthScore > 40
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                  )}
                  style={{ width: `${stats.healthScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </CardHeader>
    </Card>
  );
}
