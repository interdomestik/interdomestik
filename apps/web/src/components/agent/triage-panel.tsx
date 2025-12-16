'use client';

import { updateClaimStatus } from '@/actions/agent-claims';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { useTransition } from 'react';

const STATUSES = [
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
];

export function TriagePanel({
  claimId,
  currentStatus,
}: {
  claimId: string;
  currentStatus: string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleStatusChange = (value: string) => {
    startTransition(async () => {
      await updateClaimStatus(claimId, value);
    });
  };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>🛠️ Triage Actions</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Change Status</label>
          <Select
            defaultValue={currentStatus}
            onValueChange={handleStatusChange}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map(status => (
                <SelectItem key={status} value={status} className="capitalize">
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('verification')}
            disabled={isPending || currentStatus === 'verification'}
          >
            Verify Info
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleStatusChange('rejected')}
            disabled={isPending || currentStatus === 'rejected'}
          >
            Reject Claim
          </Button>
        </div>

        <div className="text-xs text-muted-foreground mt-4">
          Changing status updates the user's timeline immediately.
        </div>
      </CardContent>
    </Card>
  );
}
