'use client';

import { OpsActionBar } from '@/components/ops';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent } from '@interdomestik/ui/components/card';
import { cn } from '@interdomestik/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { isCommittedRefreshPending } from '../../actions/ops-action-outcome';
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
  // Set only from the structured committed-write marker. Once set, the saved operation must not be
  // offered again until the user manually refreshes the page.
  const [refreshPending, setRefreshPending] = useState(false);

  const t = useTranslations('admin.claims_page.next_actions');
  const tOps = useTranslations('admin.claims_page.ops_center');

  // Logic to hide card if there's truly nothing to show
  if (!primary && secondary.length === 0 && !claim.isStuck && !claim.hasSlaBreach) {
    return null;
  }

  // Mutation controls are suppressed for read-only viewers and while a committed write awaits a
  // manual refresh; navigation-only actions remain.
  const mutationsSuppressed = readOnly || refreshPending;
  const visibleActions = mutationsSuppressed ? toReadOnlyNextActions(nextActions) : nextActions;
  const canAssignHere = canAssign && !mutationsSuppressed;

  // Shared success path for status/SLA/reminder/reopen. A committed write whose revalidation failed
  // shows the persistent warning instead of reloading or toasting a generic success.
  const finishSuccessfulMutation = (result: unknown) => {
    if (isCommittedRefreshPending(result)) {
      setRefreshPending(true);
      return;
    }
    globalThis.location.reload();
    toast.success(t('toast.completed'));
  };

  // Plain page reload only; never re-invokes a mutation.
  const handleManualRefresh = () => {
    globalThis.location.reload();
  };

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
    if (mutationsSuppressed && !isReadOnlySafeAction(type)) return;
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
          finishSuccessfulMutation(result);
        }
      } catch {
        toast.error(t('toast.unexpected_error'));
      }
    });
  };

  const handleStatusDirectUpdate = (status: string) => {
    if (mutationsSuppressed) return;
    startTransition(async () => {
      onAction?.('update_status_direct');
      const result = await updateStatus(claim.id, status as never, locale);
      if (!result.success) {
        toast.error(result.error || t('toast.failed'));
      } else {
        finishSuccessfulMutation(result);
      }
    });
  };

  return (
    <>
      {!readOnly && !refreshPending && (
        <OpsStatusUpdateModal
          claimId={claim.id}
          isOpen={isStatusModalOpen}
          onOpenChange={setIsStatusModalOpen}
          allowedTransitions={nextActions.allowedTransitions}
          locale={locale}
          onCommittedRefreshPending={() => setRefreshPending(true)}
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

          {refreshPending && (
            <div
              role="status"
              data-testid="ops-next-actions-committed-warning"
              className="flex flex-col gap-3 rounded-md border bg-muted/50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <p>{t('committed_refresh_pending')}</p>
              <Button type="button" variant="outline" size="sm" onClick={handleManualRefresh}>
                {tOps('refresh')}
              </Button>
            </div>
          )}

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
