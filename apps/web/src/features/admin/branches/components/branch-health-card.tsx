'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { type BranchWithKpis } from '@/features/admin/branches/server/getBranchesWithKpis';
import { Link } from '@/i18n/routing';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { cn } from '@interdomestik/ui/lib/utils';
import { Activity, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { analyzeBranchRisk } from '../utils/branch-risk';
import { BranchKpiBadge } from './branch-kpi-badge';

interface BranchHealthCardProps {
  branch: BranchWithKpis;
}

export function BranchHealthCard({ branch }: BranchHealthCardProps) {
  const t = useTranslations('admin.branches');
  // Compute risk profile on render (lightweight)
  const risk = analyzeBranchRisk(branch);

  return (
    <GlassCard
      data-testid={`branch-card-${branch.code}`}
      className={cn(
        'group flex flex-col justify-between overflow-hidden transition-all duration-300 hover:shadow-lg',
        // Apply dynamic border color based on severity
        'border-l-4',
        risk.severity === 'urgent' && 'border-l-red-500',
        risk.severity === 'watch' && 'border-l-amber-500',
        risk.severity === 'healthy' && 'border-l-emerald-500',
        risk.severity === 'inactive' && 'border-l-slate-300 dark:border-l-slate-700',
        risk.colorClass // Adds potential glow/shadow via utility
      )}
    >
      {/* Header Section */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3
                className="font-semibold text-lg text-foreground truncate pr-2"
                title={branch.name}
              >
                {branch.name}
              </h3>
              <Badge variant="outline" className={cn('text-xs font-normal', risk.badgeClass)}>
                {t(risk.labelKey)}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono bg-muted/50 px-1.5 py-0.5 rounded text-[10px]">
                {branch.code}
              </span>
              <span>•</span>
              <span title={t('health_score', { score: risk.healthScore })}>
                {t('health_score', { score: risk.healthScore })}
              </span>
            </div>
          </div>

          {/* Health Score Mini-Indicator */}
          <div
            className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full border text-xs font-bold',
              risk.badgeClass
            )}
            title={t('health_score', { score: risk.healthScore })}
          >
            {risk.healthScore}
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="px-5 py-4 grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
            {t('kpis.open_claims')}
          </span>
          <BranchKpiBadge type="openClaims" count={branch.kpis.openClaims} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
            {t('kpis.cash_pending')}
          </span>
          <BranchKpiBadge type="cashPending" count={branch.kpis.cashPending} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase text-muted-foreground font-medium tracking-wider">
            {t('kpis.sla_breaches')}
          </span>
          <BranchKpiBadge type="slaBreaches" count={branch.kpis.slaBreaches} />
        </div>
      </div>

      {/* Footer / Action */}
      <div className="bg-muted/30 p-3 pt-0 mt-auto border-t border-transparent group-hover:border-border/50 transition-colors">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between hover:bg-primary/5 hover:text-primary mt-3 group/btn"
          asChild
        >
          <Link href={`/admin/branches/${branch.code}`}>
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {t('view_dashboard')}
            </span>
            <ArrowRight className="h-4 w-4 opacity-50 -translate-x-1 transition-all group-hover/btn:translate-x-0 group-hover/btn:opacity-100" />
          </Link>
        </Button>
      </div>
    </GlassCard>
  );
}
