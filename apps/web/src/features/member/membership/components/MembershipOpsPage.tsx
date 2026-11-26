'use client';

import { membershipStatusKey } from '@/lib/utils/membership-status';

import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { ClaimScopeTree } from '@/components/commercial/claim-scope-tree';
import { buildClaimScopeTreeProps } from '@/components/commercial/claim-scope-tree-content';
import { useOpsSelectionParam } from '@/components/ops/useOpsSelectionParam';
import { Link } from '@/i18n/routing';
import { formatPilotDate } from '@/lib/utils/date';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import type { DbDocument } from '@/components/ops/adapters/membership';
import type { SubscriptionRecord } from '@/app/[locale]/(app)/member/membership/_core';
import { LeaveCompanyProgramme } from './leave-company-programme';
import { DetailView } from './membership-detail-view';
import { PRIMARY_LINK } from '@/components/dashboard/member-portal-link-styles';
import { MEMBERSHIP_REGION } from './membership-region-styles';

type MembershipOpsPageProps = Readonly<{
  subscriptions: SubscriptionRecord[];
  documents: DbDocument[];
  /** A leavable sponsorship when no subscription record exists yet. */
  leaveEntryId?: string | null;
  /** The shared coverage matrix, rendered by the page with the other scope facts. */
  coverage?: ReactNode;
}>;

export function MembershipOpsPage({
  subscriptions,
  documents,
  leaveEntryId = null,
  coverage = null,
}: MembershipOpsPageProps): React.JSX.Element {
  const locale = useLocale();
  const tStatus = useTranslations('common.membershipStatus');
  const { selectedId, setSelectedId } = useOpsSelectionParam();
  const t = useTranslations('membership');
  // The read returns at most one effective record today; a list still opens on its newest one.
  const selectedSubscription = subscriptions.find(s => s.id === selectedId) ?? subscriptions[0];

  return (
    <section
      aria-labelledby="member-membership-title"
      className="min-w-0 space-y-6 [overflow-wrap:anywhere] sm:space-y-8"
    >
      <header className="max-w-3xl space-y-3 py-1 sm:py-2">
        <h1
          id="member-membership-title"
          className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl"
        >
          {t('page.title')}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-foreground/70 sm:text-base">
          {t('page.description')}
        </p>
      </header>

      {selectedSubscription ? (
        <div className="grid min-w-0 gap-6">
          {subscriptions.length > 1 ? (
            <section aria-labelledby="membership-list-title" className={MEMBERSHIP_REGION}>
              <h2 id="membership-list-title" className="text-lg font-semibold tracking-tight">
                {t('ops.title')}
              </h2>
              <ul className="grid gap-2" data-testid="membership-subscription-list">
                {subscriptions.map(subscription => {
                  const isSelected = subscription.id === selectedSubscription.id;
                  return (
                    <li key={subscription.id} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        data-testid="subscription-item"
                        onClick={() => setSelectedId(subscription.id)}
                        className={`flex min-h-11 w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-start text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline ${
                          isSelected
                            ? 'border-primary bg-[hsl(var(--primary-soft))] font-semibold'
                            : 'border-foreground/60 hover:bg-[hsl(var(--surface-strong))]'
                        }`}
                      >
                        <span className="min-w-0 font-medium" data-testid="subscription-plan-name">
                          {subscription.plan?.name || subscription.planId}
                        </span>
                        <span className="text-foreground/70">
                          {tStatus(membershipStatusKey(subscription.status))}
                          {' · '}
                          {formatPilotDate(subscription.createdAt, locale, t('plan.na'))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <DetailView
            key={selectedSubscription.id}
            subscription={selectedSubscription}
            documents={documents}
            t={t}
          />
        </div>
      ) : (
        <section
          aria-labelledby="membership-empty-title"
          className={MEMBERSHIP_REGION}
          data-testid="membership-empty"
        >
          <h2 id="membership-empty-title" className="text-lg font-semibold tracking-tight">
            {t('ops.no_membership_title')}
          </h2>
          <p className="max-w-prose text-sm leading-6 text-foreground/70">
            {t('ops.no_membership_body')}
          </p>
          <Link href="/pricing" className={PRIMARY_LINK}>
            <span className="min-w-0">{t('ops.choose_plan')}</span>
            <span aria-hidden="true" className="shrink-0 text-lg leading-none">
              →
            </span>
          </Link>
          {leaveEntryId ? <LeaveCompanyProgramme entryId={leaveEntryId} t={t} /> : null}
        </section>
      )}

      <section aria-labelledby="membership-about-title" className="min-w-0 space-y-6">
        <h2 id="membership-about-title" className="text-lg font-semibold tracking-tight">
          {t('ops.about_title')}
        </h2>
        <CommercialDisclaimerNotice
          sectionTestId="membership-commercial-disclaimers"
          eyebrow={t('disclaimers.eyebrow')}
          items={[
            {
              title: t('disclaimers.freeStart.title'),
              body: t('disclaimers.freeStart.body'),
            },
            {
              title: t('disclaimers.hotline.title'),
              body: t('disclaimers.hotline.body'),
            },
          ]}
        />
        <ClaimScopeTree {...buildClaimScopeTreeProps(t, 'membership-scope-tree')} />
        {coverage}
      </section>
    </section>
  );
}
