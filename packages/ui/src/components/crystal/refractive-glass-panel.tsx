import * as React from 'react';
import { cn } from '../../lib/utils';

export type RefractiveGlassPanelProps = React.HTMLAttributes<HTMLDivElement>;

export const RefractiveGlassPanel = React.forwardRef<HTMLDivElement, RefractiveGlassPanelProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'min-w-0 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))]/95 p-5 text-foreground shadow-sm [backdrop-filter:blur(16px)] forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] sm:p-6',
        className
      )}
      {...props}
    />
  )
);
RefractiveGlassPanel.displayName = 'RefractiveGlassPanel';
