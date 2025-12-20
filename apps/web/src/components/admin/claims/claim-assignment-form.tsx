'use client';

import { assignClaim } from '@/actions/agent-claims';
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

type StaffOption = {
  id: string;
  name: string | null;
  email: string | null;
};

type ClaimAssignmentFormProps = {
  claimId: string;
  currentStaffId: string | null;
  staff: StaffOption[];
};

export function ClaimAssignmentForm({
  claimId,
  currentStaffId,
  staff,
}: ClaimAssignmentFormProps) {
  const tCommon = useTranslations('common');
  const tClaims = useTranslations('admin.claims_page');
  const [isPending, startTransition] = useTransition();

  const handleAssign = (value: string) => {
    const nextStaffId = value === 'unassigned' ? null : value;

    startTransition(async () => {
      try {
        await assignClaim(claimId, nextStaffId);
        toast.success(tClaims('assignment.success_message'));
      } catch (error) {
        toast.error(tCommon('errors.generic'));
        console.error(error);
      }
    });
  };

  const currentValue = currentStaffId || 'unassigned';

  return (
    <div className="flex items-center gap-2">
      <Select value={currentValue} onValueChange={handleAssign} disabled={isPending}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder={tClaims('assignment.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">{tClaims('assignment.unassigned')}</SelectItem>
          {staff.map(member => (
            <SelectItem key={member.id} value={member.id}>
              {member.name || member.email || member.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && (
        <Button variant="ghost" size="sm" disabled>
          {tCommon('processing')}
        </Button>
      )}
    </div>
  );
}
