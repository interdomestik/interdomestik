import { AlertTriangle, Clock, Hourglass, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { WaitingOn } from '../types';

interface ClaimRiskIndicatorsProps {
  isStuck: boolean;
  hasSlaBreach: boolean;
  isUnassigned: boolean;
  waitingOn: WaitingOn;
  hasCashPending: boolean;
  /** If true, show all indicators. If false, hide admin-only ones. */
  showAdminIndicators?: boolean;
}

export function ClaimRiskIndicators({
  isStuck,
  hasSlaBreach,
  isUnassigned,
  waitingOn,
  hasCashPending,
  showAdminIndicators = true,
}: ClaimRiskIndicatorsProps) {
  const t = useTranslations('admin.claims_page.indicators');

  // Check if anything should be rendered
  const hasRiskIndicators = isStuck || hasSlaBreach || isUnassigned;
  const hasWaitingIndicator = waitingOn !== null;

  if (!hasRiskIndicators && !hasWaitingIndicator && !hasCashPending) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {/* Waiting on indicator (always visible) */}
      {waitingOn && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-400">
          <Hourglass className="h-3 w-3" aria-hidden="true" />
          {t(`waiting_on_${waitingOn}`)}
        </span>
      )}

      {/* Admin-only indicators (gated by showAdminIndicators) */}
      {showAdminIndicators && (
        <>
          {isStuck && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {t('stuck')}
            </span>
          )}
          {hasSlaBreach && !isStuck && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {t('sla_breach')}
            </span>
          )}
          {isUnassigned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400">
              <UserX className="h-3 w-3" aria-hidden="true" />
              {t('unassigned')}
            </span>
          )}
        </>
      )}

      {/* Cash pending (always visible if present) */}
      {hasCashPending && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400">
          {t('cash_pending')}
        </span>
      )}
    </div>
  );
}
