'use client';

import { useTrackingLabelTranslator } from '@/features/claims/tracking/components/useTrackingLabelTranslator';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { localizeMemberRecoveryPublicNote } from './member-recovery-public-note';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';

interface MemberClaimProgressSummaryProps {
  progressSummary: MemberClaimDetailOpsClaim['progressSummary'];
  /** Already localized latest public update timestamp, shared with the handling assurance panel. */
  latestUpdateDate: string;
}

export function MemberClaimProgressSummary({
  latestUpdateDate,
  progressSummary,
}: Readonly<MemberClaimProgressSummaryProps>) {
  const t = useTranslations('claims');
  const translateTrackingLabel = useTrackingLabelTranslator();

  return (
    <Card data-testid="member-claim-progress-summary">
      <CardHeader>
        <CardTitle>{t('detail.progress.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="text-xs uppercase text-muted-foreground">
              {t('detail.progress.currentState')}
            </span>
            <p className="mt-1 font-semibold" data-testid="member-claim-current-state">
              {translateTrackingLabel(progressSummary.currentStatusLabelKey)}
            </p>
          </div>
          <div>
            <span className="text-xs uppercase text-muted-foreground">
              {t('detail.progress.latestUpdate')}
            </span>
            <p className="mt-1 font-semibold" data-testid="member-claim-latest-update">
              {translateTrackingLabel(progressSummary.latestUpdateLabelKey)}
            </p>
            <p
              className="mt-1 text-xs text-muted-foreground"
              data-testid="member-claim-latest-update-date"
            >
              {latestUpdateDate}
            </p>
            {progressSummary.latestUpdateNote ? (
              <p className="mt-2 text-sm" data-testid="member-claim-latest-update-note">
                {localizeMemberRecoveryPublicNote(progressSummary.latestUpdateNote, t)}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
