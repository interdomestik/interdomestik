'use client';

import { Button } from '@interdomestik/ui';
import { CheckCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { markFollowUpAsDone } from '../actions';

interface FollowUpActionsProps {
  leadId: string;
}

export function FollowUpActions({ leadId }: FollowUpActionsProps) {
  const t = useTranslations('agent.follow_ups');
  const [isPending, setIsPending] = useState(false);

  const handleMarkDone = async () => {
    setIsPending(true);
    try {
      const res = await markFollowUpAsDone(leadId);
      if (res.success) {
        toast.success(t('markDoneSuccess'));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleMarkDone}
      disabled={isPending}
      data-testid={`followup-done-${leadId}`}
      className="text-green-600 hover:text-green-700 hover:bg-green-50"
      aria-label={t('markDone')}
    >
      <CheckCircle className="w-4 h-4 mr-2" aria-hidden="true" />
      {t('markDone')}
    </Button>
  );
}
