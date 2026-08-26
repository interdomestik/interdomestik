import { cn } from '../../lib/utils';

export interface TimelineItem {
  id: string;
  title: string;
  dateTime: string;
  dateLabel: string;
  stateLabel: string;
  description?: string;
}

export interface TimelineProps {
  ariaLabel: string;
  emptyLabel: string;
  items: readonly TimelineItem[];
  className?: string;
}

export function Timeline({ ariaLabel, className, emptyLabel, items }: Readonly<TimelineProps>) {
  if (items.length === 0) {
    return (
      <output
        aria-label={ariaLabel}
        className={cn(
          'rounded-xl border border-dashed border-[hsl(var(--border-strong))] p-5 text-sm text-foreground/70 forced-colors:border-[CanvasText]',
          className
        )}
      >
        {emptyLabel}
      </output>
    );
  }

  return (
    <ol aria-label={ariaLabel} className={cn('min-w-0 space-y-4', className)}>
      {items.map(item => (
        <li
          key={item.id}
          className="grid min-w-0 grid-cols-[auto_1fr] gap-3 border-b border-[hsl(var(--border))] pb-4 last:border-0"
        >
          <span
            aria-hidden="true"
            className="mt-1.5 size-3 rounded-full border-2 border-[hsl(var(--primary))] bg-[hsl(var(--surface))] forced-colors:border-[CanvasText]"
          />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <span className="break-words font-semibold">{item.title}</span>
              <time dateTime={item.dateTime} className="text-xs text-foreground/70">
                {item.dateLabel}
              </time>
            </div>
            <span className="mt-1 block text-xs font-medium text-foreground/70">
              {item.stateLabel}
            </span>
            {item.description ? (
              <p className="mt-2 break-words text-sm text-foreground/70">{item.description}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
