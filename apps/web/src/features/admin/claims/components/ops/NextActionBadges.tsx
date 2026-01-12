'use client';

import { Clock, ShieldAlert, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { NextActionsResult } from '../../components/detail/getNextActions';
import type { ClaimOpsDetail } from '../../types';
import { InfoPill } from '../shared/InfoPill';

interface NextActionBadgesProps {
  claim: ClaimOpsDetail;
  nextActions: NextActionsResult;
}

export function NextActionBadges({ claim, nextActions }: NextActionBadgesProps) {
  const t = useTranslations('admin.claims_page.next_actions');

  return (
    <div className="flex flex-wrap gap-2">
      {claim.hasSlaBreach && (
        <InfoPill
          icon={ShieldAlert}
          label={t('risk.sla_breach')}
          variant="danger"
          className="py-0.5 h-[22px]"
        />
      )}
      {claim.isStuck && (
        <InfoPill
          icon={Clock}
          label={t('stuck')}
          value={`${claim.daysInStage} ${t('days')}`}
          variant="warning"
          className="py-0.5 h-[22px]"
        />
      )}
      {nextActions.showAssignment &&
        claim.isUnassigned &&
        !claim.hasSlaBreach &&
        !claim.isStuck && (
          <InfoPill
            icon={UserPlus}
            label={t('status')}
            value={t('risk.unassigned')}
            variant="ghost"
            className="py-0.5 h-[22px]"
          />
        )}
    </div>
  );
}
