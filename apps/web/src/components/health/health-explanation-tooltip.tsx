'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@interdomestik/ui/components/popover';
import { cn } from '@interdomestik/ui/lib/utils';
import { AlertCircle, CheckCircle2, Info, PauseCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

type HealthSeverity = 'healthy' | 'attention' | 'urgent' | 'inactive';

interface HealthExplanationTooltipProps {
  severity: HealthSeverity;
  children: React.ReactNode;
  subject?: 'branch' | 'agent' | 'staff';
  /**
   * If true, prevents the explanation from opening (e.g., inside another interactive element)
   */
  disabled?: boolean;
}

const severityConfig = {
  healthy: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  attention: {
    icon: AlertCircle,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  urgent: {
    icon: XCircle,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
  },
  inactive: {
    icon: PauseCircle,
    color: 'text-slate-500',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
  },
} as const;

export function HealthExplanationTooltip({
  severity,
  children,
  subject = 'branch', // currently unused in copy but useful for future specificity
  disabled = false,
}: Readonly<HealthExplanationTooltipProps>) {
  const t = useTranslations('admin.branches.health.tooltip');
  const config = severityConfig[severity];
  const Icon = config.icon;
  const titleId = React.useId();

  if (disabled) return <>{children}</>;

  // Helper to reliably get bullet points as array
  // We assume 3 bullets for active states, 1 for inactive based on spec
  const bulletCount = severity === 'inactive' ? 1 : 3;
  const bullets = Array.from({ length: bulletCount }).map((_, i) => t(`${severity}.bullets.${i}`));

  return (
    <Popover>
      <div className="inline-flex min-w-0 max-w-full items-center gap-1" data-subject={subject}>
        {children}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t(`${severity}.title`)}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info aria-hidden="true" className="size-4" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        aria-labelledby={titleId}
        side="top"
        collisionPadding={16}
        className={cn(
          'w-72 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] p-0 overflow-y-auto border backdrop-blur-xl bg-background/95 [overflow-wrap:anywhere]',
          config.border
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center gap-2 px-4 py-3 border-b', config.bg, config.border)}>
          <Icon className={cn('h-5 w-5 shrink-0', config.color)} />
          <p id={titleId} className="font-semibold text-sm">
            {t(`${severity}.title`)}
          </p>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          <ul className="space-y-2">
            {bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span
                  className={cn(
                    'mt-1.5 h-1 w-1 rounded-full shrink-0',
                    config.color.replace('text-', 'bg-')
                  )}
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>

          {/* Action Line */}
          <div className="pt-2 border-t mt-2">
            <p className="text-xs font-medium flex items-center gap-2">
              <span className={config.color}>{t(`${severity}.action`)}</span>
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
