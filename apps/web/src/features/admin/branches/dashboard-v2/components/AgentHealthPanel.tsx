'use client';

import { HealthExplanationTooltip } from '@/components/health/health-explanation-tooltip';
import { GlassCard } from '@/components/ui/glass-card';
import { HealthProfile, severityStyles } from '@/features/admin/health/health-model';
import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface AgentHealthPanelProps {
  agents: {
    id: string;
    name: string;
    health: HealthProfile;
    metrics: {
      openClaims: number;
      cashPending: number;
      slaBreaches: number;
    };
  }[];
}

export function AgentHealthPanel({ agents }: AgentHealthPanelProps) {
  const t = useTranslations('admin.branches.agent_health');

  // Sort by health score ascending (worst first)
  const sorted = [...agents].sort((a, b) => a.health.score - b.health.score);

  return (
    <GlassCard className="h-full flex flex-col col-span-1 lg:col-span-2">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold">{t('title')}</h3>
        <Badge variant="outline">{agents.length}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/30 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">{t('agent')}</th>
              <th className="px-4 py-3 font-medium text-center">{t('score')}</th>
              <th className="px-4 py-3 font-medium text-center">{t('open')}</th>
              <th className="px-4 py-3 font-medium text-center">{t('cash')}</th>
              <th className="px-4 py-3 font-medium text-center">{t('sla')}</th>
              <th className="px-4 py-3 font-medium">{t('table_status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sorted.map(agent => {
              const styles = severityStyles(agent.health.severity);
              return (
                <tr key={agent.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{agent.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn('font-bold', styles.text)}>{agent.health.score}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {agent.metrics.openClaims}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.metrics.cashPending > 0 ? (
                      <span className="text-amber-500 font-bold">{agent.metrics.cashPending}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.metrics.slaBreaches > 0 ? (
                      <span className="text-red-500 font-bold">{agent.metrics.slaBreaches}</span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <HealthExplanationTooltip severity={agent.health.severity} subject="agent">
                      <Badge variant="outline" className={cn(styles.badge, 'whitespace-nowrap')}>
                        {t(`status.${agent.health.severity}`)}
                      </Badge>
                    </HealthExplanationTooltip>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('no_agents')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
