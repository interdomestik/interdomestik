// Phase 2.8: Queue Item Component
'use client';

import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { buildQueueUrl } from './utils';

export interface QueueItemProps {
  label: string;
  count: number;
  icon?: React.ElementType; // Icon is now optional (for staff list)
  filterKey: string;
  filterValue: string;
  testId: string;
  variant?: 'default' | 'ghost'; // For styling emphasis
  rightElement?: React.ReactNode; // For extra badges like Needs Action
  clearParams?: string[]; // Keys to clear when clicking this item
}

export function QueueItem({
  label,
  count,
  icon: Icon,
  filterKey,
  filterValue,
  testId,
  variant = 'ghost',
  rightElement,
  clearParams,
}: QueueItemProps) {
  const searchParams = useSearchParams();
  const currentVal = searchParams.get(filterKey);
  // Support "staff:123" matching logic if needed, but exact match is usually enough
  // For 'assignee', we might have "staff:xyz" vs just "unassigned"
  const isActive = currentVal === filterValue;

  // Build new URL
  // If clicking active, we toggle off (null)
  // If clicking inactive, we set it
  // Also clear any params specified in clearParams (e.g. clearing assignee when clicking priority)
  const updates: Record<string, string | null> = {
    [filterKey]: isActive ? null : filterValue,
  };

  if (clearParams) {
    clearParams.forEach(param => {
      updates[param] = null;
    });
  }

  // Use strict localized Link from routing
  const href = buildQueueUrl('/admin/claims', searchParams, updates);

  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors',
        isActive
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
        variant === 'default' && !isActive && 'bg-white/5' // Slight highlight for "Mine" if desired
      )}
      data-testid={testId}
    >
      <div className="flex items-center gap-2 truncate">
        {Icon && <Icon className="w-4 h-4 shrink-0 opacity-70" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {rightElement}
        {count > 0 && (
          <span
            className={cn(
              'px-1.5 py-0.5 rounded-full text-[10px] tabular-nums',
              isActive ? 'bg-primary text-primary-foreground' : 'bg-white/10 text-muted-foreground'
            )}
          >
            {count}
          </span>
        )}
      </div>
    </Link>
  );
}
