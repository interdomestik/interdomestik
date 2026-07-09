'use client';

import { formatPilotDateTime } from '@/lib/utils/date';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import type { CaseCompanionNextStep } from '@interdomestik/domain-claims';
import { useLocale, useTranslations } from 'next-intl';

type SerializedCaseCompanionNextStep = Omit<CaseCompanionNextStep, 'nextStepDate'> & {
  nextStepDate: CaseCompanionNextStep['nextStepDate'] | string;
};

function translationKey(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.replace(prefix, '') : value;
}

export function CaseCompanionNextStepCard({
  nextStep,
}: Readonly<{ nextStep: SerializedCaseCompanionNextStep }>) {
  const locale = useLocale();
  const t = useTranslations('claims-tracking.case_companion');
  const ownerLabel = t(`owner.${nextStep.owner}`);
  const statusSentence = t(
    translationKey(nextStep.statusSentenceKey, 'claims-tracking.case_companion.')
  );
  const actionLabel = t(translationKey(nextStep.actionKey, 'claims-tracking.case_companion.'));
  const expectation =
    nextStep.nextStepDate !== null
      ? formatPilotDateTime(nextStep.nextStepDate, locale, t('dateUnavailableLabel'))
      : t(`awaiting_date.${nextStep.awaitingDateReason ?? 'case_team_review'}`);

  return (
    <Card data-testid="member-claim-case-companion-next-step">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <span className="text-xs uppercase text-muted-foreground">{t('ownerLabel')}</span>
            <p className="mt-1 font-semibold" data-testid="member-claim-next-step-owner">
              {ownerLabel}
            </p>
          </div>
          <div>
            <span className="text-xs uppercase text-muted-foreground">{t('statusLabel')}</span>
            <p className="mt-1 font-semibold" data-testid="member-claim-next-step-status">
              {statusSentence}
            </p>
          </div>
          <div>
            <span className="text-xs uppercase text-muted-foreground">{t('expectationLabel')}</span>
            <p className="mt-1 font-semibold" data-testid="member-claim-next-step-expectation">
              {expectation}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6" data-testid="member-claim-next-step-action">
          {actionLabel}
        </p>
      </CardContent>
    </Card>
  );
}

export type { SerializedCaseCompanionNextStep };
