'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AgentStats {
  total: number;
  new: number;
  inProgress: number;
  completed: number;
}

export function AgentStatsCards({ stats }: { stats: AgentStats }) {
  const t = useTranslations('agent.stats');

  const statConfig = [
    {
      title: t('total'),
      value: stats.total,
      icon: Activity,
      color: 'text-muted-foreground',
    },
    {
      title: t('new'),
      value: stats.new,
      icon: AlertCircle,
      color: 'text-blue-500',
    },
    {
      title: t('verification'),
      value: stats.inProgress,
      icon: Clock,
      color: 'text-orange-500',
    },
    {
      title: t('closed'),
      value: stats.completed,
      icon: CheckCircle,
      color: 'text-green-500',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="agent-stats-cards">
      {statConfig.map(stat => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
