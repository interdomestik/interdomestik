// Phase 2.8: KPI Card Component
import { Card } from '@interdomestik/ui';
import type { LucideIcon } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  variant?: 'default' | 'warning' | 'danger';
  testId: string;
}

const VARIANT_STYLES = {
  default: 'text-foreground',
  warning: 'text-amber-500',
  danger: 'text-red-500',
} as const;

/**
 * KPICard — Single KPI statistic display.
 * Phase 2.8 component, ≤50 LOC as per SonarQube guidelines.
 */
export function KPICard({ label, value, icon: Icon, variant = 'default', testId }: KPICardProps) {
  return (
    <Card
      className="flex items-center gap-3 px-4 py-3 bg-background/40 backdrop-blur-sm border-white/5"
      data-testid={testId}
    >
      <Icon className={`h-5 w-5 ${VARIANT_STYLES[variant]}`} aria-hidden="true" />
      <div className="flex flex-col">
        <span className={`text-2xl font-bold ${VARIANT_STYLES[variant]}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    </Card>
  );
}
