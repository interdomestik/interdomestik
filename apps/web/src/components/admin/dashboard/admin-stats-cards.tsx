import type { DashboardStats } from '@/actions/admin-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { AlertCircle, CheckCircle, FileText, Users } from 'lucide-react';
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
      color: 'text-muted-foreground',
    },
    {
      title: t('new'),
      value: stats.newClaims,
      icon: AlertCircle,
      color: 'text-orange-500',
    },
    {
      title: t('closed'),
      value: stats.resolvedClaims,
      icon: CheckCircle,
      color: 'text-green-500',
    },
    {
      title: 'Active Members',
      value: stats.totalUsers,
      icon: Users,
      color: 'text-blue-500',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map(card => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
