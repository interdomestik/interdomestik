'use client';

import { assignClaim, ClaimStatus, updateClaimStatus } from '@/actions/staff-claims';
import { getStaffClaimStatusLabel } from '@/lib/claim-ui';
import { CLAIM_STATUSES as CANONICAL_CLAIM_STATUSES } from '@interdomestik/database/constants';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface ClaimActionPanelProps {
  claimId: string;
  currentStatus: string;
  staffId: string;
  assigneeId: string | null;
}

const CLAIM_STATUS_OPTIONS: { value: ClaimStatus; label: string }[] = CANONICAL_CLAIM_STATUSES.map(
  status => ({
    value: status as ClaimStatus,
    label: getStaffClaimStatusLabel(status),
  })
);

export function ClaimActionPanel({
  claimId,
  currentStatus,
  staffId,
  assigneeId,
}: ClaimActionPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<ClaimStatus>(currentStatus as ClaimStatus);
  const router = useRouter();

  const handleAssign = () => {
    startTransition(async () => {
      const result = await assignClaim(claimId);
      if (result.success) {
        toast.success('Success', { description: 'Claim assigned to you' });
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
      }
    });
  };

  const handleStatusUpdate = () => {
    startTransition(async () => {
      const result = await updateClaimStatus(claimId, status as ClaimStatus, note);
      if (result.success) {
        toast.success('Success', { description: 'Claim status updated' });
        setNote('');
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
      }
    });
  };

  const isAssignedToMe = assigneeId === staffId;
  const hasStatusChanged = status !== currentStatus;

  return (
    <div className="bg-white rounded-lg border shadow-sm p-6 space-y-6">
      <h3 className="font-semibold text-lg">Staff Actions</h3>

      {/* Assignment Section */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div>
          <p className="text-sm font-medium">Assignment</p>
          <p className="text-xs text-muted-foreground">
            {assigneeId
              ? isAssignedToMe
                ? 'Assigned to you'
                : 'Assigned to colleague'
              : 'Unassigned'}
          </p>
        </div>
        {!isAssignedToMe && (
          <Button size="sm" onClick={handleAssign} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {assigneeId ? 'Reassign to Me' : 'Assign to Me'}
          </Button>
        )}
        {isAssignedToMe && (
          <Button size="sm" variant="outline" disabled>
            Assigned
          </Button>
        )}
      </div>

      {/* Status Update Section */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Update Status</label>
          <Select
            value={status}
            onValueChange={value => setStatus(value as ClaimStatus)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {CLAIM_STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Status Note <span className="text-xs text-muted-foreground">(Visible to member)</span>
          </label>
          <Textarea
            placeholder="Reason for status change..."
            value={note}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>

        <Button
          className="w-full"
          onClick={handleStatusUpdate}
          disabled={isPending || (!hasStatusChanged && !note)}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Claim
        </Button>
      </div>
    </div>
  );
}
