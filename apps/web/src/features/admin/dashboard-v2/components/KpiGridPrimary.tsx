'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { AlertTriangle, FileText, Landmark, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DashboardV2Data } from '../server/getTenantAdminDashboardV2Data';

export function KpiGridPrimary({ kpis }: { kpis: DashboardV2Data['kpis'] }) {
  const t = useTranslations('admin.dashboard_v2.kpis');

  const items = [
    {
      label: t('branches'),
      value: kpis.branches,
      icon: Landmark,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      label: t('agents'),
      value: kpis.agents,
      icon: Users,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/20',
    },
    {
      label: t('members'),
      value: kpis.members,
      icon: ShieldCheck,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
      border: 'border-violet-500/20',
    },
    {
      label: t('open_claims'),
      value: kpis.claimsOpen,
      icon: FileText,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      label: t('cash_pending'),
      value: kpis.cashPending,
      icon: Wallet,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      label: t('sla_breaches'),
      value: kpis.slaBreaches,
      icon: AlertTriangle,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
      {items.map((item, idx) => (
        <GlassCard
          key={idx}
          className={`p-4 flex flex-col justify-between hover:scale-[1.02] transition-transform duration-300 ${item.border}`}
          gradient
        >
          <div className="flex justify-between items-start">
            <div className={`p-2 rounded-lg ${item.bg}`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold tracking-tight">{item.value}</div>
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
              {item.label}
            </div>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
