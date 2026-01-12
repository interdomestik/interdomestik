import { Badge } from '@interdomestik/ui';
import { AlertTriangle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import type { LifecycleStage } from '../types';

export interface StateSpineProps {
  stage: LifecycleStage;
  daysInStage: number;
  isStuck: boolean;
  hasSlaBreach: boolean;
  compact?: boolean;
}

/**
 * Risk state variant configuration.
 * Precedence: SLA > stuck > neutral (per Phase 2.5 spec)
 */
interface SpineVariant {
  containerClass: string;
  badgeClass: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  labelKey: 'sla_breach' | 'stuck' | null;
  icon: typeof Clock | typeof AlertTriangle | null;
}

/**
 * Determines visual variant based on risk state.
 * Uses deterministic precedence: SLA breach > stuck > neutral
 * Single-entry-point for styling to avoid duplicated JSX branches (S3776)
 */
export function getSpineVariant(isStuck: boolean, hasSlaBreach: boolean): SpineVariant {
  // Priority 1: SLA breach (highest)
  if (hasSlaBreach) {
    return {
      containerClass: 'border-red-500/30 bg-red-500/5',
      badgeClass: 'font-bold animate-pulse',
      badgeVariant: 'destructive',
      labelKey: 'sla_breach',
      icon: Clock,
    };
  }

  // Priority 2: Stuck
  if (isStuck) {
    return {
      containerClass: 'border-amber-500/30 bg-amber-500/5',
      badgeClass: 'font-semibold border-amber-500 text-amber-500',
      badgeVariant: 'outline',
      labelKey: 'stuck',
      icon: AlertTriangle,
    };
  }

  // Priority 3: Neutral (no risk) - visible but subdued
  return {
    containerClass: 'border-slate-500/30 bg-slate-500/10',
    badgeClass: 'font-medium',
    badgeVariant: 'secondary',
    labelKey: null,
    icon: null,
  };
}

/**
 * StateSpine — Left column dominant visual anchor (Phase 2.5)
 *
 * Shows:
 * - Stage badge (with days)
 * - Risk badge (SLA breach or stuck) when applicable
 *
 * Layout: vertical stack, responsive width
 * Risk badges appear in spine only (not duplicated elsewhere)
 */
export function StateSpine({
  stage,
  daysInStage,
  isStuck,
  hasSlaBreach,
  compact,
}: StateSpineProps) {
  const tTabs = useTranslations('admin.claims_page.lifecycle_tabs');
  const tIndicators = useTranslations('admin.claims_page.indicators');

  const stageLabel = tTabs(stage);
  const variant = getSpineVariant(isStuck, hasSlaBreach);
  const IconComponent = variant.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border transition-colors',
        compact ? 'min-w-[84px] py-1 gap-0.5' : 'min-w-[96px] md:min-w-[112px] gap-1.5 p-2',
        variant.containerClass
      )}
      data-testid="state-spine"
    >
      {/* Stage badge */}
      <Badge
        variant={variant.badgeVariant}
        className={`text-xs ${variant.badgeClass} truncate max-w-full`}
        title={stageLabel}
      >
        {stageLabel}
      </Badge>

      {/* Days in stage */}
      <span className="text-xs font-medium text-muted-foreground">{daysInStage}d</span>

      {/* Risk badge (only if applicable, never duplicated) */}
      {variant.labelKey && IconComponent && (
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
            variant.labelKey === 'sla_breach'
              ? 'bg-red-500/20 text-red-400'
              : 'bg-amber-500/20 text-amber-400'
          }`}
          title={tIndicators(variant.labelKey)}
          aria-label={tIndicators(variant.labelKey)}
          data-testid={`risk-badge-${variant.labelKey}`}
        >
          <IconComponent className="h-2.5 w-2.5" aria-hidden="true" />
          <span className="sr-only md:not-sr-only">{tIndicators(variant.labelKey)}</span>
        </span>
      )}
    </div>
  );
}
