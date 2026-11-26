'use client';

import type { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { formatPilotDate } from '@/lib/utils/date';
import { useEffect, useState } from 'react';

type MembershipPeriodGraceFactsProps = Readonly<{
  subscription: Pick<
    SubscriptionRecord,
    | 'status'
    | 'cancelAtPeriodEnd'
    | 'currentPeriodStart'
    | 'currentPeriodEnd'
    | 'gracePeriodEndsAt'
    | 'sponsorCoverage'
  >;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
}>;

export function MembershipPeriodGraceFacts({
  subscription,
  locale,
  t,
}: MembershipPeriodGraceFactsProps): React.JSX.Element {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rawGracePeriodEndsAt = subscription.gracePeriodEndsAt;
  const gracePeriodEndsAt = rawGracePeriodEndsAt ? new Date(rawGracePeriodEndsAt) : null;
  const hasGraceDeadline = gracePeriodEndsAt !== null && !Number.isNaN(gracePeriodEndsAt.getTime());
  const graceDeadlineMs = hasGraceDeadline ? gracePeriodEndsAt.getTime() : null;
  const isGraceExpired = graceDeadlineMs !== null && nowMs >= graceDeadlineMs;

  useEffect(() => {
    if (subscription.status !== 'past_due' || graceDeadlineMs === null || isGraceExpired) return;

    const remainingMs = graceDeadlineMs - Date.now();
    const timer = window.setTimeout(
      () => setNowMs(Date.now()),
      Math.max(1, Math.min(remainingMs, 2_147_483_647))
    );
    return () => window.clearTimeout(timer);
  }, [subscription.status, graceDeadlineMs, isGraceExpired, nowMs]);

  return (
    <>
      {subscription.sponsorCoverage ? (
        <div className="min-w-0 space-y-1 sm:col-span-2">
          <dt className="text-foreground/70">{t('ops.sponsor_coverage_label')}</dt>
          <dd className="font-semibold" data-testid="membership-sponsor-coverage">
            {t('sponsorCoverage.covered_until', {
              date: formatPilotDate(subscription.sponsorCoverage.coverageEnd, locale, t('plan.na')),
            })}
          </dd>
        </div>
      ) : null}
      <div className="min-w-0 space-y-1">
        <dt className="text-foreground/70">{t('plan.current_period_label')}</dt>
        <dd className="font-semibold" data-testid="membership-current-period-end">
          {subscription.sponsorCoverage
            ? `${formatPilotDate(subscription.currentPeriodStart, locale, t('plan.na'))} – `
            : ''}
          {formatPilotDate(subscription.currentPeriodEnd, locale, t('plan.na'))}
        </dd>
      </div>

      {subscription.cancelAtPeriodEnd && !subscription.sponsorCoverage ? (
        <div className="min-w-0 space-y-1" data-testid="membership-renewal">
          <dt className="text-foreground/70">{t('ops.renewal_label')}</dt>
          <dd className="font-semibold">{t('ops.renewal_stops')}</dd>
        </div>
      ) : null}

      {subscription.status === 'past_due' ? (
        <div className="min-w-0 space-y-1 sm:col-span-2" data-testid="membership-grace-deadline">
          <dt className="text-foreground/70">{t('dunning.grace_deadline_title')}</dt>
          {hasGraceDeadline ? (
            <dd className={isGraceExpired ? 'font-semibold text-red-600' : 'font-semibold'}>
              {t(
                isGraceExpired
                  ? 'dunning.grace_deadline_passed_label'
                  : 'dunning.grace_deadline_future_label'
              )}
              : {formatPilotDate(gracePeriodEndsAt, locale, t('plan.na'))}
            </dd>
          ) : (
            <dd className="text-foreground/70">{t('dunning.grace_deadline_unavailable')}</dd>
          )}
        </div>
      ) : null}
    </>
  );
}
