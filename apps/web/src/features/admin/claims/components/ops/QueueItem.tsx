// Phase 2.7: Queue Item Component
'use client';

import { Badge, Button } from '@interdomestik/ui';
import type { LucideIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';

import { isPoolDefiningParam } from './utils';

interface QueueItemProps {
  label: string;
  count?: number;
  icon?: LucideIcon;
  filterKey: string;
  filterValue: string;
  testId: string;
}

/**
 * QueueItem — Single filter button in queue sidebar.
 */
export function QueueItem({
  label,
  count,
  icon: Icon,
  filterKey,
  filterValue,
  testId,
}: QueueItemProps) {
  const searchParams = useSearchParams();

  const currentValue = searchParams.get(filterKey);
  const isActive = currentValue === filterValue;

  // Build new URL with this filter (priority changes always reset page to 0)
  const newParams = new URLSearchParams(searchParams.toString());
  if (isActive) {
    newParams.delete(filterKey);
  } else {
    newParams.set(filterKey, filterValue);
  }

  // If this is a priority filter change, EXPLICITLY reset page to 0
  // poolAnchor remains UNCHANGED (per requirement)
  // If this is a priority filter change, EXPLICITLY reset page to 0
  // poolAnchor remains UNCHANGED (per requirement)
  // Logic: priority changes keep anchor; pool-defining params clear it.
  if (isPoolDefiningParam(filterKey)) {
    newParams.delete('poolAnchor');
  }

  // Always reset pagination on filter change
  newParams.delete('page');

  /* 
    FIX: Do NOT rely on usePathname() here. 
    We want to force these links to ALWAYS go to the Claims Ops Center, 
    even if this component is somehow rendered elsewhere. 
  */
  const locale = useLocale(); // e.g. 'sq'
  const basePath = `/${locale}/admin/claims`;
  const href = `${basePath}?${newParams.toString()}`;

  return (
    <Button
      asChild
      variant={isActive ? 'secondary' : 'ghost'}
      className="w-full justify-between h-auto py-2 px-3"
      data-testid={testId}
    >
      <a href={href}>
        <span className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          <span className="text-sm">{label}</span>
        </span>
        {count !== undefined && count > 0 && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {count}
          </Badge>
        )}
      </a>
    </Button>
  );
}
