'use client';

import { useTrackingLabelTranslator } from '@/features/claims/tracking/components/useTrackingLabelTranslator';
import { toPilotDateTimeAttribute } from '@/lib/utils/date';
import { useTranslations } from 'next-intl';
import { localizeMemberRecoveryPublicNote } from './member-recovery-public-note';
import type { MemberClaimDetailOpsClaim } from './member-claim-detail-types';
import { DETAIL_CARD, DETAIL_HEADING, DETAIL_TERM } from './member-claim-detail-styles';

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
  const note = progressSummary.latestUpdateNote
    ? localizeMemberRecoveryPublicNote(progressSummary.latestUpdateNote, t)
    : null;

  return (
    <div className={`${DETAIL_CARD} space-y-5`} data-testid="member-claim-progress-summary">
      <h2 className={DETAIL_HEADING}>{t('detail.progress.title')}</h2>
      <dl className="grid min-w-0 gap-4 text-sm md:grid-cols-2">
        <div className="min-w-0 space-y-1 rounded-lg border-s-4 border-primary bg-[hsl(var(--primary-soft))] p-3 forced-colors:border-[CanvasText]">
          <dt className={DETAIL_TERM}>{t('detail.progress.currentState')}</dt>
          <dd className="text-base font-semibold" data-testid="member-claim-current-state">
            {translateTrackingLabel(progressSummary.currentStatusLabelKey)}
          </dd>
        </div>
        <div className="min-w-0 space-y-1 p-3">
          <dt className={DETAIL_TERM}>{t('detail.progress.latestUpdate')}</dt>
          <dd className="space-y-1">
            <p className="text-base font-semibold" data-testid="member-claim-latest-update">
              {translateTrackingLabel(progressSummary.latestUpdateLabelKey)}
            </p>
            <p className="text-foreground/70">
              <time
                data-testid="member-claim-latest-update-date"
                dateTime={toPilotDateTimeAttribute(progressSummary.latestUpdateAt)}
              >
                {latestUpdateDate}
              </time>
            </p>
            {note ? (
              <p className="pt-1 leading-6" data-testid="member-claim-latest-update-note">
                {note}
              </p>
            ) : null}
          </dd>
        </div>
      </dl>
    </div>
  );
}
