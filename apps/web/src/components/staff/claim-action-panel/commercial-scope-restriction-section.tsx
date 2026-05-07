'use client';

import type { AcceptedRecoveryPrerequisitesSnapshot } from '@/actions/staff-claims.core';

import { useClaimActionPanel } from './context';

type CommercialScopeRestrictionSectionProps = {
  commercialScope: AcceptedRecoveryPrerequisitesSnapshot['commercialScope'];
};

export function CommercialScopeRestrictionSection({
  commercialScope,
}: CommercialScopeRestrictionSectionProps) {
  const { t } = useClaimActionPanel();

  if (commercialScope.isEligible) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
      data-testid="staff-commercial-scope-restriction"
    >
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-slate-900">
          {t('staff_actions.commercial_scope.title')}
        </h4>
        <p className="font-medium text-slate-900">{commercialScope.staffLabel}</p>
        <p className="text-xs text-slate-700">{commercialScope.staffDescription}</p>
      </div>
    </div>
  );
}
