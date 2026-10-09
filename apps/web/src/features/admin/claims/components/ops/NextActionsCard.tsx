'use client';

import { OpsActionBar } from '@/components/ops';
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
import { NextActionSecondary, type AssignmentIntent } from './NextActionSecondary';
import type { StaffAssignmentOption } from './StaffAssignmentSelect';
import { OpsStatusUpdateModal } from './OpsStatusUpdateModal';

// Navigation-only actions never invoke a server mutation, so read-only viewers keep them.
const READ_ONLY_SAFE_ACTION_TYPES: ReadonlySet<string> = new Set(['review_blockers']);

function isReadOnlySafeAction(type: string): boolean {
  return READ_ONLY_SAFE_ACTION_TYPES.has(type);
}

// Read-only presentation: badges/context still use the full result; only navigation actions and
// no status transitions are offered, so no mutation control can render.
function toReadOnlyNextActions(nextActions: NextActionsResult): NextActionsResult {
  return {
    ...nextActions,
    primary:
      nextActions.primary && isReadOnlySafeAction(nextActions.primary.type)
        ? nextActions.primary
        : null,
    secondary: nextActions.secondary.filter(action => isReadOnlySafeAction(action.type)),
    allowedTransitions: [],
  };
}

type NextActionsCardProps = Readonly<{
  claim: ClaimOpsDetail;
  nextActions: NextActionsResult;
  locale: string;
  currentUserId?: string;
  allStaff: readonly StaffAssignmentOption[];
  canAssign?: boolean;
  /**
   * Explicit read-only presentation derived on the server from the trusted session/visibility.
   * Independent of canAssign: it suppresses every mutation control and handler on this card.
   */
  readOnly?: boolean;
  onAction?: (actionType: string) => void;
}>;

export function NextActionsCard({
  claim,
  nextActions,
  locale,
  allStaff,
  canAssign = false,
  readOnly = false,
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

  const visibleActions = readOnly ? toReadOnlyNextActions(nextActions) : nextActions;
  const canAssignHere = canAssign && !readOnly;

  const handleAssign = (staffId: string, intent: AssignmentIntent) => {
    if (isPending || !canAssignHere) return;
    startTransition(async () => {
      onAction?.(intent); // Ops tracking
      try {
        const result = await assignOwner(claim.id, staffId, locale);
        if (!result.success) {
          toast.error(result.error || t('toast.failed'));
        } else {
          globalThis.location.reload();
          toast.success(t('toast.completed'));
        }
      } catch {
        toast.error(t('toast.unexpected_error'));
      }
    });
  };

  const handleActionClick = (type: string) => {
    // Server actions re-check the exercised role; this keeps read-only viewers from invoking them.
    if (readOnly && !isReadOnlySafeAction(type)) return;
    onAction?.(type);

    if (type === 'update_status') {
      setIsStatusModalOpen(true);
      return;
    }

    startTransition(async () => {
      let result;
      try {
        switch (type) {
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
          globalThis.location.reload();
          toast.success(t('toast.completed'));
        }
      } catch {
        toast.error(t('toast.unexpected_error'));
      }
    });
  };

  const handleStatusDirectUpdate = (status: string) => {
    if (readOnly) return;
    startTransition(async () => {
      onAction?.('update_status_direct');
      const result = await updateStatus(claim.id, status as never, locale);
      if (!result.success) {
        toast.error(result.error || t('toast.failed'));
      } else {
        globalThis.location.reload();
        toast.success(t('toast.completed'));
      }
    });
  };

  return (
    <>
      {!readOnly && (
        <OpsStatusUpdateModal
          claimId={claim.id}
          isOpen={isStatusModalOpen}
          onOpenChange={setIsStatusModalOpen}
          allowedTransitions={nextActions.allowedTransitions}
          locale={locale}
        />
      )}

      <Card
        data-testid="ops-next-actions"
        aria-busy={isPending}
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

          <OpsActionBar className="border-0 pt-0 mt-0">
            <div className="flex flex-col gap-4 w-full">
              <NextActionPrimary
                primary={visibleActions.primary}
                isPending={isPending}
                canAssign={canAssignHere}
                staffOptions={allStaff}
                onAssign={staffId => handleAssign(staffId, 'assign')}
                onAction={handleActionClick}
              />
              <NextActionSecondary
                secondary={visibleActions.secondary}
                allStaff={allStaff}
                canAssign={canAssignHere}
                allowedTransitions={visibleActions.allowedTransitions}
                isPending={isPending}
                onAction={handleActionClick}
                onAssign={handleAssign}
                onStatusUpdate={handleStatusDirectUpdate}
              />
            </div>
          </OpsActionBar>
        </CardContent>
      </Card>
    </>
  );
}
