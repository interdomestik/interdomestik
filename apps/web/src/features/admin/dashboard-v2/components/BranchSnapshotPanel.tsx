'use client';

import { GlassCard } from '@/components/ui/glass-card';
import { Badge } from '@interdomestik/ui/components/badge';
import { ScrollArea } from '@interdomestik/ui/components/scroll-area';
import { Building2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DashboardV2Data } from '../server/getTenantAdminDashboardV2Data';

export function BranchSnapshotPanel({
  branches,
  colSpan,
}: {
  branches: DashboardV2Data['branchesSnapshot'];
  colSpan?: number;
}) {
  const t = useTranslations('admin.dashboard_v2.branches');

  return (
    <GlassCard
      className={`p-0 overflow-hidden flex flex-col h-full col-span-12 md:col-span-${colSpan ?? 12}`}
    >
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-lg">{t('title')}</h3>
        </div>
        <Badge variant="outline" className="text-xs">
          {branches.length} {t('active')}
        </Badge>
      </div>
      <ScrollArea className="h-[300px]">
        <div className="p-4 space-y-3">
          {branches.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">{t('no_branches')}</div>
          ) : (
            branches.map(branch => (
              <div
                key={branch.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{branch.name}</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {branch.city}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold">
                      {branch.activeUsers} / {branch.totalUsers}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      {t('active_users')}
                    </span>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Users className="h-4 w-4" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </GlassCard>
  );
}
