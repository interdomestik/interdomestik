import * as React from 'react';
import { cn } from '../../lib/utils';
import { crystalFocus, crystalMotion } from './tokens';

export interface MatteAnchorCardProps extends Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  'children' | 'href'
> {
  href: string;
  label: string;
  description: string;
  eyebrow?: string;
}

export const MatteAnchorCard = React.forwardRef<HTMLAnchorElement, MatteAnchorCardProps>(
  ({ className, description, eyebrow, label, ...props }, ref) => (
    <a
      ref={ref}
      className={cn(
        'group flex min-h-11 min-w-0 flex-col justify-between gap-5 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-strong))] p-5 text-foreground shadow-sm forced-colors:border-[CanvasText] sm:p-6',
        'hover:border-[hsl(var(--border-strong))] hover:shadow-md',
        crystalFocus,
        crystalMotion,
        className
      )}
      {...props}
    >
      {eyebrow ? (
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--muted-700))]">
          {eyebrow}
        </span>
      ) : null}
      <span className="min-w-0">
        <span className="block break-words text-lg font-semibold">{label}</span>
        <span className="mt-1 block break-words text-sm text-[hsl(var(--muted-700))]">
          {description}
        </span>
      </span>
    </a>
  )
);
MatteAnchorCard.displayName = 'MatteAnchorCard';
