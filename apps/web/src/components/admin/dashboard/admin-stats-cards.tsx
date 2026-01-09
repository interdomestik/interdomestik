import type { DashboardStats } from '@/actions/admin-dashboard';
import { GlassCard } from '@/components/ui/glass-card';
import { AlertCircle, CheckCircle2, FileText, TrendingUp, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface AdminStatsCardsProps {
  stats: DashboardStats;
}

export async function AdminStatsCards({ stats }: AdminStatsCardsProps) {
  const t = await getTranslations('agent.stats');

  const cards = [
    {
      title: t('total'),
      value: stats.totalClaims,
      icon: FileText,
      gradient: 'from-blue-500 to-cyan-500',
      iconBg: 'bg-blue-500/20 text-blue-500',
    },
    {
      title: t('new'),
      value: stats.newClaims,
      icon: AlertCircle,
      gradient: 'from-orange-500 to-red-500',
      iconBg: 'bg-orange-500/20 text-orange-500',
    },
    {
      title: t('closed'),
      value: stats.resolvedClaims,
      icon: CheckCircle2,
      gradient: 'from-green-500 to-emerald-500',
      iconBg: 'bg-green-500/20 text-green-500',
    },
    {
      title: 'Active Members',
      value: stats.totalUsers,
      icon: Users,
      gradient: 'from-violet-500 to-purple-500',
      iconBg: 'bg-violet-500/20 text-violet-500',
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {cards.map(card => (
        <GlassCard key={card.title} className="p-6" gradient>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
              <h3 className="mt-2 text-3xl font-bold tracking-tight">{card.value}</h3>
            </div>
            <div className={`rounded-xl p-3 ${card.iconBg} ring-1 ring-inset ring-white/10`}>
              <card.icon className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-muted-foreground">
            <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
            <span className="text-green-500 font-medium">+12%</span>
            <span className="ml-1">from last month</span>
          </div>
        </GlassCard>
      ))}
    </div>
  );
}
