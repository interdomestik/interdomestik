import { UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OwnerRole, WaitingOn } from '../types';

interface ClaimOwnerLineProps {
  ownerRole: OwnerRole;
  ownerName: string | null;
  waitingOn: WaitingOn;
  isUnassigned?: boolean;
}

/**
 * Owner/responsibility line with visual emphasis for staff-action states.
 * Unassigned state shows warning accent.
 */
export function ClaimOwnerLine({
  ownerRole,
  ownerName,
  waitingOn,
  isUnassigned = false,
}: ClaimOwnerLineProps) {
  const t = useTranslations('admin.claims_page.indicators');
  const tOwner = useTranslations('claims.owner');

  // Unassigned: prominent warning
  if (isUnassigned) {
    return (
      <div className="flex items-center gap-1.5 text-sm font-medium text-orange-500">
        <UserX className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('unassigned')}</span>
      </div>
    );
  }

  // Waiting on staff: directive emphasis
  if (waitingOn === 'staff') {
    return (
      <div className="text-sm font-medium text-foreground">
        {ownerName ? (
          <span>
            {tOwner('staff')}: <span className="font-semibold">{ownerName}</span>
          </span>
        ) : (
          <span className="text-amber-500">{t('waiting_on_staff')}</span>
        )}
      </div>
    );
  }

  // Waiting on member: subdued
  if (waitingOn === 'member') {
    return <div className="text-xs text-muted-foreground">{t('waiting_on_member')}</div>;
  }

  // System: minimal
  if (waitingOn === null || ownerRole === 'system') {
    return <div className="text-xs text-muted-foreground/60">{t('waiting_on_system')}</div>;
  }

  // Fallback: assigned owner
  return (
    <div className="text-sm text-muted-foreground">
      {tOwner(ownerRole)}: {ownerName ?? '—'}
    </div>
  );
}
