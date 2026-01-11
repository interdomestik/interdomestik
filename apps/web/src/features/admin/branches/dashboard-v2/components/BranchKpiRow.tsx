'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { cn } from '@interdomestik/ui/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { AlertOctagon, Banknote, Briefcase, FileText, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface BranchKpiRowProps {
  kpis: {
    openClaims: number;
    cashPending: number;
    slaBreaches: number;
    totalMembers: number;
    totalAgents: number;
  };
}

export function BranchKpiRow({ kpis }: BranchKpiRowProps) {
  const t = useTranslations('admin.branches.kpis');

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        label={t('open_claims')}
        value={kpis.openClaims}
        icon={FileText}
        alert={kpis.openClaims > 20}
        warning={kpis.openClaims > 10}
      />
      <KpiCard
        label={t('cash_pending')}
        value={kpis.cashPending}
        icon={Banknote}
        alert={kpis.cashPending > 0}
        // Any cash pending is bad practice, usually implies risk
      />
      <KpiCard
        label={t('sla_breaches')}
        value={kpis.slaBreaches}
        icon={AlertOctagon}
        alert={kpis.slaBreaches > 0} // Zero tolerance
      />
      <KpiCard label={t('total_agents')} value={kpis.totalAgents} icon={Briefcase} />
      <KpiCard label={t('total_members')} value={kpis.totalMembers} icon={Users} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  alert,
  warning,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  alert?: boolean;
  warning?: boolean;
}) {
  return (
    <GlassCard
      className={cn(
        'p-4 flex items-center justify-between transition-colors',
        alert && 'bg-red-500/5 border-red-500/20',
        warning && !alert && 'bg-amber-500/5 border-amber-500/20'
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <span
          className={cn(
            'text-2xl font-bold tracking-tight',
            alert && 'text-red-600 dark:text-red-400',
            warning && 'text-amber-600 dark:text-amber-400'
          )}
        >
          {value}
        </span>
      </div>
      <div
        className={cn(
          'p-2 rounded-lg bg-muted/50',
          alert && 'bg-red-500/10 text-red-500',
          warning && 'bg-amber-500/10 text-amber-500'
        )}
      >
        <Icon className="h-5 w-5 opacity-70" />
      </div>
    </GlassCard>
  );
}
