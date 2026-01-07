'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type PipelineChartProps = {
  data: {
    newLeads: number;
    contactedLeads: number;
    wonDeals: number;
  };
};

function CustomTooltip({ active, payload }: any) {
  if (active && payload?.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="font-medium text-muted-foreground">{payload[0].payload.name}:</span>
          <span className="font-bold">{payload[0].value}</span>
        </div>
      </div>
    );
  }
  return null;
}

export function PipelineChart({ data }: PipelineChartProps) {
  const t = useTranslations('agent.pipeline');

  const chartData = [
    {
      name: t('new_leads') || 'New Leads',
      value: data.newLeads,
      fill: 'hsl(var(--primary))',
    },
    {
      name: t('contacted') || 'Contacted',
      value: data.contactedLeads,
      fill: 'hsl(var(--secondary))',
    },
    {
      name: t('won') || 'Won',
      value: data.wonDeals,
      fill: 'hsl(var(--success))',
    },
  ];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{t('title') || 'Pipeline Overview'}</CardTitle>
        <CardDescription>{t('subtitle') || 'Your sales funnel performance'}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted-100))', opacity: 0.2 }}
                content={<CustomTooltip />}
              />
              <Bar
                dataKey="value"
                radius={4}
                barSize={32}
                background={{
                  fill: 'hsl(var(--muted-100))',
                  radius: 4,
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
