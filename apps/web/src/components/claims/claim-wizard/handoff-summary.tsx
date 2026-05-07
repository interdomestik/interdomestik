import * as React from 'react';
import type { useTranslations } from 'next-intl';

import type { ClaimWizardHandoffContext } from './types';

export function ClaimWizardHandoffSummary(
  props: Readonly<{
    handoffContext: ClaimWizardHandoffContext;
    handoffCountryLabel: string;
    t: ReturnType<typeof useTranslations>;
  }>
): React.JSX.Element {
  const { handoffContext, handoffCountryLabel, t } = props;

  return (
    <div
      data-testid="claim-wizard-handoff"
      className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-950"
      data-source={handoffContext.source}
      data-incident-location={handoffContext.incidentLocation}
    >
      <p className="font-semibold">{t('handoff.title')}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
            {t('handoff.sourceLabel')}
          </dt>
          <dd>{t('handoff.sourceValue')}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
            {t('handoff.countryLabel')}
          </dt>
          <dd>{handoffCountryLabel}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
            {t('handoff.incidentLocationLabel')}
          </dt>
          <dd>{t('handoff.incidentLocationValue')}</dd>
        </div>
      </dl>
    </div>
  );
}
