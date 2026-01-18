'use client';

import { OpsTable } from '@/components/ops';
import { GlassCard } from '@/components/ui/glass-card';
import { Badge } from '@interdomestik/ui/components/badge';
import { BarChart3, Clock, FileCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DashboardV2Data } from '../server/getTenantAdminDashboardV2Data';

export function SecondaryPanelsGrid({
  claims,
  leads,
  agents,
}: {
  claims: DashboardV2Data['claimsPipeline'];
  leads: DashboardV2Data['leadsSummary'];
  agents: DashboardV2Data['agentPerformance'];
}) {
  const t = useTranslations('admin.dashboard_v2.panels');

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Claims Pipeline Panel */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />
            {t('claims_pipeline')}
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{t('unassigned')}</span>
            <Badge variant="outline" className="border-amber-500/20 text-amber-500 bg-amber-500/10">
              {claims.unassigned}
            </Badge>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{t('in_progress')}</span>
            <Badge variant="outline" className="border-blue-500/20 text-blue-500 bg-blue-500/10">
              {claims.inProgress}
            </Badge>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{t('in_review')}</span>
            <Badge
              variant="outline"
              className="border-indigo-500/20 text-indigo-500 bg-indigo-500/10"
            >
              {claims.review}
            </Badge>
          </div>
          <div className="pt-2 border-t border-white/5 flex gap-2">
            <div className="flex-1 p-2 rounded bg-emerald-500/5 border border-emerald-500/10 flex flex-col items-center">
              <span className="text-xs text-muted-foreground">{t('approved')}</span>
              <span className="font-bold text-emerald-500">{claims.approved}</span>
            </div>
            <div className="flex-1 p-2 rounded bg-rose-500/5 border border-rose-500/10 flex flex-col items-center">
              <span className="text-xs text-muted-foreground">{t('rejected')}</span>
              <span className="font-bold text-rose-500">{claims.rejected}</span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Leads & Payments Panel */}
      <GlassCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-emerald-500" />
            {t('leads')}
          </h3>
          <span className="text-xs font-mono text-emerald-400">
            {leads.conversionRate.toFixed(1)}% {t('conversion_rate')}
          </span>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-end gap-2 mb-2">
            <span className="text-3xl font-bold">{leads.converted}</span>
            <span className="text-sm text-muted-foreground mb-1">
              {' '}
              / {leads.total} {t('total')}
            </span>
          </div>
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">
              {t('recent_activity')}
            </span>
            {leads.recent.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">{t('no_recent_leads')}</div>
            ) : (
              leads.recent.slice(0, 3).map(lead => (
                <div
                  key={lead.id}
                  className="flex justify-between items-center text-sm p-2 rounded bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <span className="font-medium">{lead.name}</span>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {t(`lead_status.${lead.status}`)}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-0 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            {t('top_performers')}
          </h3>
        </div>
        <div className="p-0">
          <OpsTable
            columns={[
              { key: 'agent', header: t('agent') },
              { key: 'sales', header: t('sales'), className: 'text-right' },
            ]}
            rows={agents.map((agent, i) => ({
              id: agent.id,
              cells: [
                <div key="agent" className="flex items-center gap-2">
                  {i < 3 && (
                    <Badge
                      variant="secondary"
                      className="h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]"
                    >
                      {i + 1}
                    </Badge>
                  )}
                  <span className={i < 3 ? 'font-medium' : 'text-muted-foreground'}>
                    {agent.name}
                  </span>
                </div>,
                <span key="sales" className="font-medium">
                  {agent.sales}
                </span>,
              ],
            }))}
            emptyLabel={t('no_agent_data')}
            containerClassName="border-none bg-transparent backdrop-blur-none"
          />
        </div>
      </GlassCard>
    </div>
  );
}
