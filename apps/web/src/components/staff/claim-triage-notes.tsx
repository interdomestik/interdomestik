'use client';

import { ClaimStatus, updateClaimStatus } from '@/actions/staff-claims';
import { Button, Textarea } from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface ClaimTriageNotesProps {
  claimId: string;
  currentStatus: string;
}

export function ClaimTriageNotes({ claimId, currentStatus }: ClaimTriageNotesProps) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const router = useRouter();

  const handleAddInternalNote = () => {
    startTransition(async () => {
      const trimmed = note.trim();
      if (!trimmed) return;

      const result = await updateClaimStatus(claimId, currentStatus as ClaimStatus, trimmed, false);

      if (result.success) {
        toast.success('Saved', { description: 'Internal note added' });
        setNote('');
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Internal note <span className="text-xs text-muted-foreground">(Staff only)</span>
        </label>
        <Textarea
          placeholder="Add an internal triage note..."
          value={note}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
          disabled={isPending}
          className="min-h-[90px]"
        />
      </div>

      <Button onClick={handleAddInternalNote} disabled={isPending || note.trim().length === 0}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Add internal note
      </Button>
    </div>
  );
}
