import * as React from 'react';
import { cn } from '../../lib/utils';

export interface UnifiedPortalShellProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'children' | 'dangerouslySetInnerHTML'
> {
  caseLabel: string;
  caseRegion: React.ReactNode;
  actionsLabel: string;
  actionsRegion: React.ReactNode;
  timelineLabel: string;
  timelineRegion: React.ReactNode;
}

export const UnifiedPortalShell = React.forwardRef<HTMLDivElement, UnifiedPortalShellProps>(
  (
    {
      actionsLabel,
      actionsRegion,
      caseLabel,
      caseRegion,
      className,
      timelineLabel,
      timelineRegion,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      className={cn('grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]', className)}
      {...props}
    >
      <section aria-label={caseLabel} className="grid min-w-0">
        {caseRegion}
      </section>
      <div className="grid min-w-0 content-start gap-4">
        <section aria-label={actionsLabel} className="min-w-0">
          {actionsRegion}
        </section>
        <section aria-label={timelineLabel} className="min-w-0">
          {timelineRegion}
        </section>
      </div>
    </div>
  )
);
UnifiedPortalShell.displayName = 'UnifiedPortalShell';
