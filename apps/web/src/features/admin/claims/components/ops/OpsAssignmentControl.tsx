'use client';

import { Button } from '@interdomestik/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { assignOwner, unassignOwner } from '../../actions/ops-actions';

interface OpsAssignmentControlProps {
  claimId: string;
  currentStaffId: string | null;
  staff: { id: string; name: string | null; email: string }[];
  locale: string;
}

export function OpsAssignmentControl({
  claimId,
  currentStaffId,
  staff,
  locale,
}: OpsAssignmentControlProps) {
  const tCommon = useTranslations('common');
  const tClaims = useTranslations('admin.claims_page');
  const [isPending, startTransition] = useTransition();

  const handleAssign = (value: string) => {
    startTransition(async () => {
      try {
        let result;
        if (value === 'unassigned') {
          result = await unassignOwner(claimId, locale);
        } else {
          result = await assignOwner(claimId, value, locale);
        }

        if (!result.success) {
          toast.error(result.error || tCommon('errors.generic'));
        } else {
          toast.success(tClaims('assignment.success_message'));
        }
      } catch (_error) {
        toast.error(tCommon('errors.generic'));
      }
    });
  };

  const currentValue = currentStaffId || 'unassigned';

  return (
    <div className="flex items-center gap-2">
      <Select value={currentValue} onValueChange={handleAssign} disabled={isPending}>
        <SelectTrigger className="w-[200px] h-9 text-xs">
          <SelectValue placeholder={tClaims('assignment.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned" className="text-xs text-muted-foreground">
            {tClaims('assignment.unassigned')}
          </SelectItem>
          {staff.map(member => (
            <SelectItem key={member.id} value={member.id} className="text-xs">
              {member.name || member.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && (
        <Button variant="ghost" size="sm" disabled className="h-8 w-8 p-0 animate-spin">
          {/* Spinner or similar indicator if needed, but select disabled states works too */}
          <span className="sr-only">Loading...</span>
        </Button>
      )}
    </div>
  );
}
