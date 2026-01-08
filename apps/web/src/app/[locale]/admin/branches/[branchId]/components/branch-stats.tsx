import type { BranchStats as BranchStatsType } from '@/actions/branch-dashboard.types';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { CalendarDays, FileText, Users, UserSquare2 } from 'lucide-react';
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
    },
    {
      title: t('stats_members'),
      value: stats.totalMembers,
      icon: Users,
      color: 'text-green-500',
    },
    {
      title: t('stats_total_claims'),
      value: stats.totalClaimsAllTime,
      icon: FileText,
      color: 'text-muted-foreground',
    },
    {
      title: t('stats_claims_this_month'),
      value: stats.claimsThisMonth,
      icon: CalendarDays,
      color: 'text-orange-500',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map(card => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle as="h2" className="text-sm font-medium">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
