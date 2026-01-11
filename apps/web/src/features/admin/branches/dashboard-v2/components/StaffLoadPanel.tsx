'use client';

import { HealthExplanationTooltip } from '@/components/health/health-explanation-tooltip';
import { GlassCard } from '@/components/ui/glass-card';
import { severityStyles } from '@/features/admin/health/health-model';
import { Badge } from '@interdomestik/ui/components/badge';
import { cn } from '@interdomestik/ui/lib/utils';
import { useTranslations } from 'next-intl';

interface StaffLoadPanelProps {
  staff: {
    id: string;
    name: string;
    workload: number;
    severity: 'healthy' | 'attention' | 'urgent';
  }[];
}

export function StaffLoadPanel({ staff }: StaffLoadPanelProps) {
  const t = useTranslations('admin.branches.staff_load');
  const sorted = [...staff].sort((a, b) => b.workload - a.workload);

  return (
    <GlassCard className="h-full flex flex-col">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold">{t('title')}</h3>
        <Badge variant="outline">{staff.length}</Badge>
      </div>
      <div className="p-0 overflow-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground bg-muted/30 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium text-right">{t('workload')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sorted.map(person => {
              const styles = severityStyles(
                person.severity === 'urgent'
                  ? 'urgent'
                  : person.severity === 'attention'
                    ? 'attention'
                    : 'healthy'
              );

              return (
                <tr key={person.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{person.name}</td>
                  <td className="px-4 py-3 text-right">
                    <HealthExplanationTooltip
                      severity={
                        person.severity === 'urgent'
                          ? 'urgent'
                          : person.severity === 'attention'
                            ? 'attention'
                            : 'healthy'
                      }
                      subject="staff"
                      disabled={person.workload === 0}
                    >
                      <Badge
                        variant="secondary"
                        className={cn(person.workload > 0 && styles.badge)}
                      >
                        {person.workload}
                      </Badge>
                    </HealthExplanationTooltip>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                  {t('no_staff')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
