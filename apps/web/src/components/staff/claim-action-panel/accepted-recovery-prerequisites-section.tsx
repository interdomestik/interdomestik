'use client';

import type { AcceptedRecoveryPrerequisitesSnapshot } from '@/actions/staff-claims.core';

import { useClaimActionPanel } from './context';

type AcceptedRecoveryPrerequisitesSectionProps = {
  prerequisites: AcceptedRecoveryPrerequisitesSnapshot;
};

export function AcceptedRecoveryPrerequisitesSection({
  prerequisites,
}: AcceptedRecoveryPrerequisitesSectionProps) {
  const { t } = useClaimActionPanel();

  if (!prerequisites.isAcceptedRecoveryDecision) {
    return null;
  }

  return (
    <div
      className="rounded-lg border bg-muted/30 p-4 text-sm"
      data-testid="staff-accepted-recovery-prerequisites"
    >
      <div className="space-y-1">
        <h4 className="text-sm font-medium">{t('staff_actions.recovery_prerequisites.title')}</h4>
        <p className="text-xs text-muted-foreground">
          {t('staff_actions.recovery_prerequisites.description')}
        </p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div>
          <span className="text-muted-foreground">
            {t('staff_actions.recovery_prerequisites.agreement')}
          </span>
          <div className="font-medium text-slate-900">
            {prerequisites.agreementReady
              ? t('staff_actions.common.ready')
              : t('staff_actions.common.missing')}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">
            {t('staff_actions.recovery_prerequisites.collection_path')}
          </span>
          <div className="font-medium text-slate-900">
            {prerequisites.collectionPathReady
              ? t('staff_actions.common.ready')
              : t('staff_actions.common.missing')}
          </div>
        </div>
      </div>
    </div>
  );
}
