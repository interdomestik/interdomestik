import type { BranchStats as BranchStatsType } from '@/actions/branch-dashboard.types';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { cn } from '@interdomestik/ui/lib/utils';
import { AlertTriangle, Euro, FileText, Users, UserSquare2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

interface BranchStatsProps {
  stats: BranchStatsType;
}

export async function BranchStats({ stats }: BranchStatsProps) {
  const t = await getTranslations('admin.branches.dashboard');

  const cards = [
    {
      title: t('stats_agents'),
      value: stats.totalAgents,
      icon: UserSquare2,
      color: 'text-blue-500',
      active: true,
    },
    {
      title: t('stats_members'),
      value: stats.totalMembers,
      icon: Users,
      color: 'text-green-500',
      active: true,
    },
    {
      title: t('stats_open_claims'),
      value: stats.openClaims,
      icon: FileText,
      color: stats.openClaims > 10 ? 'text-amber-500' : 'text-muted-foreground',
      active: stats.openClaims > 0,
    },
    {
      title: t('stats_cash_pending'),
      value: stats.cashPending,
      icon: Euro,
      color: stats.cashPending > 0 ? 'text-amber-600' : 'text-muted-foreground',
      active: stats.cashPending > 0,
    },
    {
      title: t('stats_sla_breaches'),
      value: stats.slaBreaches,
      icon: AlertTriangle,
      color: stats.slaBreaches > 0 ? 'text-red-600' : 'text-muted-foreground',
      active: stats.slaBreaches > 0,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map(card => (
        <Card
          key={card.title}
          className={cn(
            'transition-colors',
            card.active ? 'bg-background' : 'bg-muted/30 opacity-80'
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle as="h2" className="text-sm font-medium">
              {card.title}
            </CardTitle>
            <card.icon className={cn('h-4 w-4', card.color)} />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', card.active ? '' : 'text-muted-foreground')}>
              {card.value.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
