'use client';

import type { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { formatPilotDate } from '@/lib/utils/date';
import { useEffect, useState } from 'react';

type MembershipPeriodGraceFactsProps = Readonly<{
  subscription: Pick<SubscriptionRecord, 'status' | 'currentPeriodEnd' | 'gracePeriodEndsAt'>;
  locale: string;
  t: (key: string) => string;
}>;

export function MembershipPeriodGraceFacts({
  subscription,
  locale,
  t,
}: MembershipPeriodGraceFactsProps) {
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
      <div>
        <h4 className="text-sm font-medium text-muted-foreground">
          {t('plan.current_period_label')}
        </h4>
        <p data-testid="membership-current-period-end">
          {formatPilotDate(subscription.currentPeriodEnd, locale, t('plan.na'))}
        </p>
      </div>

      {subscription.status === 'past_due' ? (
        <div data-testid="membership-grace-deadline">
          <h4 className="text-sm font-medium text-muted-foreground">
            {t('dunning.grace_deadline_title')}
          </h4>
          {hasGraceDeadline ? (
            <p className={isGraceExpired ? 'text-sm text-red-600' : 'text-sm'}>
              {t(
                isGraceExpired
                  ? 'dunning.grace_deadline_passed_label'
                  : 'dunning.grace_deadline_future_label'
              )}
              : {formatPilotDate(gracePeriodEndsAt, locale, t('plan.na'))}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('dunning.grace_deadline_unavailable')}
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
