'use client';

import { Card, CardContent } from '@interdomestik/ui/components/card';
import { cn } from '@interdomestik/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  assignOwner,
  markSlaAcknowledged,
  sendMemberReminder,
  updateStatus,
} from '../../actions/ops-actions';
import type { NextActionsResult } from '../../components/detail/getNextActions';
import type { ClaimOpsDetail } from '../../types';
import { NextActionBadges } from './NextActionBadges';
import { NextActionPrimary } from './NextActionPrimary';
import { NextActionSecondary } from './NextActionSecondary';
import { OpsStatusUpdateModal } from './OpsStatusUpdateModal';

interface NextActionsCardProps {
  claim: ClaimOpsDetail;
  nextActions: NextActionsResult;
  locale: string;
  currentUserId: string;
  allStaff: { id: string; name: string | null; email: string }[];
  onAction?: (actionType: string) => void;
}

export function NextActionsCard({
  claim,
  nextActions,
  locale,
  currentUserId,
  allStaff,
  onAction,
}: NextActionsCardProps) {
  const { primary, secondary } = nextActions;
  const [isPending, startTransition] = useTransition();
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const t = useTranslations('admin.claims_page.next_actions');

  // Logic to hide card if there's truly nothing to show
  if (!primary && secondary.length === 0 && !claim.isStuck && !claim.hasSlaBreach) {
    return null;
  }

  const handleAssign = (userId: string) => {
    startTransition(async () => {
      onAction?.('reassign'); // Ops tracking
      const result = await assignOwner(claim.id, userId, locale);
      if (!result.success) {
        toast.error(result.error || t('toast.failed'));
      } else {
        toast.success(t('toast.completed'));
      }
    });
  };

  const handleActionClick = (type: string) => {
    onAction?.(type);

    if (type === 'update_status') {
      setIsStatusModalOpen(true);
      return;
    }

    startTransition(async () => {
      let result;
      try {
        switch (type) {
          case 'assign':
            result = await assignOwner(claim.id, currentUserId, locale);
            break;
          case 'ack_sla':
            result = await markSlaAcknowledged(claim.id, locale);
            break;
          case 'message_poke':
            result = await sendMemberReminder(claim.id, 'email', locale);
            break;
          case 'reopen':
            result = await updateStatus(claim.id, 'evaluation', locale);
            break;
          case 'review_blockers':
            document.getElementById('timeline-section')?.scrollIntoView({ behavior: 'smooth' });
            return;
          default:
            return;
        }

        if (result && !result.success) {
          toast.error(result.error || t('toast.failed'));
        } else if (result && result.success) {
          toast.success(t('toast.completed'));
        }
      } catch {
        toast.error(t('toast.unexpected_error'));
      }
    });
  };

  const handleStatusDirectUpdate = (status: string) => {
    startTransition(async () => {
      onAction?.('update_status_direct');
      const result = await updateStatus(claim.id, status as any, locale);
      if (!result.success) {
        toast.error(result.error || t('toast.failed'));
      } else {
        toast.success(t('toast.completed'));
      }
    });
  };

  return (
    <>
      <OpsStatusUpdateModal
        claimId={claim.id}
        isOpen={isStatusModalOpen}
        onOpenChange={setIsStatusModalOpen}
        allowedTransitions={nextActions.allowedTransitions}
        locale={locale}
      />

      <Card
        className={cn(
          'border-l-4 shadow-sm',
          claim.hasSlaBreach
            ? 'border-l-destructive'
            : claim.isStuck
              ? 'border-l-orange-500'
              : 'border-l-primary'
        )}
      >
        <CardContent className="p-4 flex flex-col gap-4">
          <NextActionBadges claim={claim} nextActions={nextActions} />

          <NextActionPrimary primary={primary} isPending={isPending} onAction={handleActionClick} />

          <NextActionSecondary
            secondary={secondary}
            allStaff={allStaff}
            allowedTransitions={nextActions.allowedTransitions}
            isPending={isPending}
            onAction={handleActionClick}
            onAssign={handleAssign}
            onStatusUpdate={handleStatusDirectUpdate}
          />
        </CardContent>
      </Card>
    </>
  );
}
