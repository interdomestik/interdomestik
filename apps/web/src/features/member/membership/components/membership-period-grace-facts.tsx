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

type Translate = MembershipPeriodGraceFactsProps['t'];
type Subscription = MembershipPeriodGraceFactsProps['subscription'];

/** The grace deadline and whether it has passed; re-renders once when a future deadline passes. */
function useGraceDeadline(subscription: Subscription) {
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

  return { gracePeriodEndsAt, hasGraceDeadline, isGraceExpired };
}

type FactProps = Readonly<{ subscription: Subscription; locale: string; t: Translate }>;

function SponsorCoverageFact({ subscription, locale, t }: FactProps) {
  if (!subscription.sponsorCoverage) return null;
  return (
    <div className="min-w-0 space-y-1 sm:col-span-2">
      <dt className="text-foreground/70">{t('ops.sponsor_coverage_label')}</dt>
      <dd className="font-semibold" data-testid="membership-sponsor-coverage">
        {t('sponsorCoverage.covered_until', {
          date: formatPilotDate(subscription.sponsorCoverage.coverageEnd, locale, t('plan.na')),
        })}
      </dd>
    </div>
  );
}

function CurrentPeriodFact({ subscription, locale, t }: FactProps) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-foreground/70">{t('plan.current_period_label')}</dt>
      <dd className="font-semibold" data-testid="membership-current-period-end">
        {subscription.sponsorCoverage
          ? `${formatPilotDate(subscription.currentPeriodStart, locale, t('plan.na'))} – `
          : ''}
        {formatPilotDate(subscription.currentPeriodEnd, locale, t('plan.na'))}
      </dd>
    </div>
  );
}

function RenewalFact({ subscription, t }: Omit<FactProps, 'locale'>) {
  if (!subscription.cancelAtPeriodEnd || subscription.sponsorCoverage) return null;
  return (
    <div className="min-w-0 space-y-1" data-testid="membership-renewal">
      <dt className="text-foreground/70">{t('ops.renewal_label')}</dt>
      <dd className="font-semibold">{t('ops.renewal_stops')}</dd>
    </div>
  );
}

type GraceDeadlineFactProps = Readonly<{
  grace: ReturnType<typeof useGraceDeadline>;
  locale: string;
  t: Translate;
}>;

function GraceDeadlineFact({ grace, locale, t }: GraceDeadlineFactProps) {
  const { gracePeriodEndsAt, hasGraceDeadline, isGraceExpired } = grace;
  return (
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
  );
}

export function MembershipPeriodGraceFacts({
  subscription,
  locale,
  t,
}: MembershipPeriodGraceFactsProps): React.JSX.Element {
  const grace = useGraceDeadline(subscription);
  return (
    <>
      <SponsorCoverageFact subscription={subscription} locale={locale} t={t} />
      <CurrentPeriodFact subscription={subscription} locale={locale} t={t} />
      <RenewalFact subscription={subscription} t={t} />
      {subscription.status === 'past_due' ? (
        <GraceDeadlineFact grace={grace} locale={locale} t={t} />
      ) : null}
    </>
  );
}
