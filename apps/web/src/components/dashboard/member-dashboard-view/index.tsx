import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import {
  ActiveClaimFocus,
  MemberEmptyState,
  MemberHeader,
  PrimaryActions,
  SupportLink,
} from '@/components/member-dashboard';
import { isAgent } from '@/lib/roles.core';
import { getSupportContacts } from '@/lib/support-contacts';
import { resolveDateLocale } from '@/lib/utils/date';

import { AccountErrorState } from './account-error-state';
import { ActivationPanel } from './activation-panel';
import { CommandCenterCard } from './command-center-card';
import { getCachedTenantSubscriptions, getCachedUser } from './data';
import { DashboardHero } from './dashboard-hero';
import { DiasporaRibbon } from './diaspora-ribbon';
import { getRoleRedirect } from './helpers';
import { MemberActionGrid } from './member-action-grid';
import { MemberGuidancePanel } from './member-guidance-panel';
import { OrientationCard } from './orientation-card';
import { ReferralStatusColumn } from './referral-status-column';
import { ServiceEcosystemGrid } from './service-ecosystem-grid';
import { SupportReadinessCard } from './support-readiness-card';
import type { DashboardTranslator, MemberDashboardViewProps } from './types';

export type { MemberDashboardViewProps } from './types';

export async function MemberDashboardView({ data, locale }: Readonly<MemberDashboardViewProps>) {
  const [dashboardTranslations, memberLandingTranslations] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('dashboard.member_landing'),
  ]);
  const t = dashboardTranslations as unknown as DashboardTranslator;
  const tLanding = memberLandingTranslations as unknown as DashboardTranslator;
  const { member, claims, activeClaimId, supportHref } = data;
  const activeClaim = claims.find(claim => claim.id === activeClaimId) ?? null;
  const orientationHref = supportHref;

  const userDetails = await getCachedUser(member.id);

  const redirectPath = getRoleRedirect(userDetails?.role);
  if (redirectPath) {
    redirect(redirectPath);
  }

  // V3 Change: Agents are Members too. Do not redirect them.
  // if (userDetails?.role === 'agent') { redirect('/agent'); }

  if (!userDetails) {
    return <AccountErrorState tLanding={tLanding} />;
  }

  const tenantId = userDetails.tenantId ?? null;
  const [claimEligibleSubscription, tenantSubscriptions] = await Promise.all([
    tenantId ? getActiveSubscription(member.id, tenantId) : Promise.resolve(null),
    tenantId ? getCachedTenantSubscriptions(member.id, tenantId) : Promise.resolve([]),
  ]);

  const subscription = claimEligibleSubscription ?? tenantSubscriptions[0] ?? null;
  const isActive = Boolean(claimEligibleSubscription);
  const hasNoClaims = claims.length === 0;
  const shouldShowActivationPanel = !isActive;
  const validThru = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString(resolveDateLocale(locale), {
        month: '2-digit',
        year: '2-digit',
      })
    : tLanding('unavailable_short');
  const contacts = getSupportContacts({ tenantId: userDetails.tenantId ?? null, locale });
  const supportStatusLabel = isActive ? tLanding('status_active') : tLanding('status_pending');
  const heroSubtitle = isActive
    ? tLanding('hero_subtitle_active')
    : tLanding('hero_subtitle_inactive');

  return (
    <div className="min-w-0 max-w-full space-y-10 pb-10" data-testid="member-dashboard-ready">
      <section
        aria-labelledby="member-dashboard-priority-heading"
        className="min-w-0 space-y-5"
        data-testid="member-dashboard-priority-region"
      >
        <div className="min-w-0 space-y-3">
          <MemberHeader name={member.name} membershipNumber={member.membershipNumber} />
          <h2
            id="member-dashboard-priority-heading"
            className="break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            data-testid="dashboard-heading"
          >
            {tLanding('priority_region_label')}
          </h2>
        </div>
        <PrimaryActions locale={locale} />
        <MemberGuidancePanel
          activeClaim={activeClaim}
          hasNoClaims={hasNoClaims}
          isActive={isActive}
          supportHref={supportHref}
          tLanding={tLanding}
          validThru={validThru}
        />
        {hasNoClaims ? (
          <OrientationCard orientationHref={orientationHref} tLanding={tLanding} />
        ) : null}

        {activeClaim ? (
          <ActiveClaimFocus
            claimNumber={activeClaim.claimNumber}
            locale={locale}
            status={activeClaim.status}
            stageLabel={activeClaim.stageLabel}
            stageKey={activeClaim.stageKey}
            updatedAt={activeClaim.updatedAt}
            nextMemberAction={
              activeClaim.requiresMemberAction ? activeClaim.nextMemberAction : undefined
            }
          />
        ) : null}

        {hasNoClaims ? <MemberEmptyState locale={locale} /> : null}

        <SupportLink href={supportHref} />

        {shouldShowActivationPanel ? <ActivationPanel tLanding={tLanding} /> : null}
      </section>

      <section
        aria-labelledby="member-dashboard-secondary-heading"
        className="min-w-0 space-y-6"
        data-testid="member-dashboard-secondary-region"
      >
        <div className="flex min-w-0 items-center justify-between px-1">
          <h2
            id="member-dashboard-secondary-heading"
            className="min-w-0 break-words text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {tLanding('secondary_region_label')}
          </h2>
        </div>

        {/* Adaptive Header Section */}
        <DashboardHero
          heroSubtitle={heroSubtitle}
          isActive={isActive}
          memberNumber={userDetails.memberNumber}
          supportStatusLabel={supportStatusLabel}
          tLanding={tLanding}
          userName={userDetails.name}
          validThru={validThru}
        />

        <DiasporaRibbon t={t} tLanding={tLanding} />

        {/* Action Center - Primary Grid */}
        <div className="grid min-w-0 grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="min-w-0 space-y-8 lg:col-span-2">
            <MemberActionGrid t={t} tLanding={tLanding} />
          </div>

          <SupportReadinessCard isActive={isActive} supportHref={supportHref} tLanding={tLanding} />
        </div>

        {/* Secondary Service Tiles - Glass Grid */}
        <ServiceEcosystemGrid t={t} tLanding={tLanding} />

        <div className="grid min-w-0 gap-8 lg:grid-cols-3">
          <CommandCenterCard contacts={contacts} tLanding={tLanding} />

          <ReferralStatusColumn
            isAgentRole={isAgent(userDetails.role)}
            supportHref={supportHref}
            tLanding={tLanding}
          />
        </div>
      </section>
    </div>
  );
}
