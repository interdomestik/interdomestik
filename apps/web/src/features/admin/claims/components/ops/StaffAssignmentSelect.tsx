'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { cn } from '@interdomestik/ui/lib/utils';
import { UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type StaffAssignmentOption = Readonly<{ id: string; name: string | null; email: string }>;

type StaffAssignmentSelectProps = Readonly<{
  staffOptions: readonly StaffAssignmentOption[];
  isPending: boolean;
  onSelect: (staffId: string) => void;
  size?: 'default' | 'compact';
  className?: string;
}>;

export function StaffAssignmentSelect({
  staffOptions,
  isPending,
  onSelect,
  size = 'default',
  className,
}: StaffAssignmentSelectProps) {
  const t = useTranslations('admin.claims_page.assignment');
  const isCompact = size === 'compact';

  return (
    // Held at "" so no target is ever preselected and a failed choice can be retried.
    <Select value="" onValueChange={onSelect} disabled={isPending || staffOptions.length === 0}>
      <SelectTrigger
        aria-label={t('label')}
        aria-busy={isPending}
        className={cn('h-9 w-auto min-w-[10rem] gap-2 text-sm', className)}
      >
        <UserPlus className={cn('opacity-70', isCompact ? 'w-3 h-3' : 'w-4 h-4')} />
        <SelectValue placeholder={t('placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {staffOptions.map(member => (
          <SelectItem
            key={member.id}
            value={member.id}
            className={isCompact ? 'text-xs' : undefined}
          >
            {member.name || member.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
