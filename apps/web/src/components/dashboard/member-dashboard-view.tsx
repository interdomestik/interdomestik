import type { MemberDashboardData } from '@interdomestik/domain-member';

import { DigitalIDCard } from '@/app/[locale]/components/home/digital-id-card';
import {
  ActiveClaimFocus,
  MemberEmptyState,
  MemberHeader,
  PrimaryActions,
  SupportLink,
} from '@/components/member-dashboard';
import { HomeGrid } from '@/components/member/HomeGrid';
import { ReferralCard } from '@/components/member/referral-card';
import { Link } from '@/i18n/routing';
import { isAgent } from '@/lib/roles.core';
import { getSupportContacts } from '@/lib/support-contacts';
import { resolveDateLocale } from '@/lib/utils/date';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { and, db, eq, subscriptions, user } from '@interdomestik/database';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import {
  ArrowRight,
  FileText,
  Globe,
  Headphones,
  HeartPulse,
  LayoutDashboard,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { MatteAnchorCard } from './matte-anchor-card';

const getCachedUser = cache(async (userId: string) => {
  return db.query.user.findFirst({
    where: eq(user.id, userId),
  });
});

const getCachedTenantSubscriptions = cache(async (userId: string, tenantId: string) => {
  return db.query.subscriptions.findMany({
    where: and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)),
    orderBy: (subscriptionTable, { desc }) => [desc(subscriptionTable.createdAt)],
  });
});

export type MemberDashboardViewProps = {
  data: MemberDashboardData;
  locale: string;
};

type DashboardClaim = MemberDashboardData['claims'][number];

function getRoleRedirect(role: string | null | undefined): '/admin' | '/staff' | null {
  if (role === 'admin' || role === 'super_admin' || role === 'tenant_admin') {
    return '/admin';
  }

  if (role === 'staff' || role === 'branch_manager') {
    return '/staff';
  }

  return null;
}

function AccountErrorState({
  tLanding,
}: Readonly<{
  tLanding: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
      <div className="p-4 rounded-full bg-red-100 text-red-600">
        <ShieldAlert className="w-12 h-12" />
      </div>
      <h2 className="text-2xl font-bold">{tLanding('account_error_title')}</h2>
      <p className="text-muted-foreground">{tLanding('account_error_body')}</p>
      <Button asChild variant="outline" className="rounded-xl">
        <Link href="/member/help">{tLanding('account_error_cta')}</Link>
      </Button>
    </div>
  );
}

function ActivationPanel({
  tLanding,
}: Readonly<{ tLanding: Awaited<ReturnType<typeof getTranslations>> }>) {
  return (
    <section
      data-testid="member-activation-panel"
      className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-6 shadow-sm"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-800">
            {tLanding('activation_title')}
          </p>
          <p className="max-w-2xl text-sm font-medium leading-6 text-slate-700">
            {tLanding('activation_body')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="rounded-2xl">
            <Link href="/member/membership">{tLanding('activation_primary_cta')}</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/pricing">{tLanding('activation_secondary_cta')}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function MemberGuidancePanel({
  activeClaim,
  hasNoClaims,
  isActive,
  supportHref,
  tLanding,
  validThru,
}: Readonly<{
  activeClaim: DashboardClaim | null;
  hasNoClaims: boolean;
  isActive: boolean;
  supportHref: string;
  tLanding: Awaited<ReturnType<typeof getTranslations>>;
  validThru: string;
}>) {
  const claimNumber = activeClaim?.claimNumber ?? activeClaim?.id ?? tLanding('unavailable_short');
  const claimHref = activeClaim ? `/member/claims/${activeClaim.id}` : '/member/claims';
  const memberAction = activeClaim?.requiresMemberAction ? activeClaim.nextMemberAction : undefined;

  const nextAction = (() => {
    if (hasNoClaims && !isActive) {
      return {
        title: tLanding('activation_title'),
        body: tLanding('activation_body'),
        href: '/member/membership',
        cta: tLanding('guidance_membership_cta'),
        testId: 'member-guidance-activation',
      };
    }

    if (hasNoClaims) {
      return {
        title: tLanding('guidance_no_claim_title'),
        body: tLanding('guidance_no_claim_body'),
        href: '/member/claims/new',
        cta: tLanding('guidance_start_claim_cta'),
        testId: 'member-guidance-start-claim',
      };
    }

    if (memberAction) {
      return {
        title: tLanding('guidance_action_needed_title'),
        body: tLanding('guidance_action_needed_body', { claimNumber }),
        href: memberAction.href,
        cta: memberAction.label,
        testId: 'member-guidance-action-needed',
      };
    }

    if (activeClaim) {
      return {
        title: tLanding('guidance_active_claim_title'),
        body: tLanding('guidance_active_claim_body', { claimNumber }),
        href: claimHref,
        cta: tLanding('guidance_claim_review_cta'),
        testId: 'member-guidance-active-claim',
      };
    }

    return {
      title: tLanding('guidance_claims_title'),
      body: tLanding('guidance_claims_body'),
      href: '/member/claims',
      cta: tLanding('guidance_claims_cta'),
      testId: 'member-guidance-claims-history',
    };
  })();

  return (
    <section
      aria-labelledby="member-guidance-title"
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70"
      data-testid="member-guidance-panel"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
            {tLanding('guidance_label')}
          </p>
          <h2 id="member-guidance-title" className="text-xl font-bold tracking-tight">
            {tLanding('guidance_title')}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {isActive
              ? tLanding('guidance_subtitle_active')
              : tLanding('guidance_subtitle_inactive')}
          </p>
        </div>
        <div
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold dark:border-white/10"
          data-testid="member-guidance-membership-status"
        >
          <ShieldCheck
            className={isActive ? 'h-4 w-4 text-emerald-600' : 'h-4 w-4 text-amber-600'}
          />
          <span>
            {isActive
              ? tLanding('guidance_membership_active')
              : tLanding('guidance_membership_inactive')}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <article
          className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
          data-testid={nextAction.testId}
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
            <ArrowRight className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold">{nextAction.title}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{nextAction.body}</p>
          <Button
            asChild
            variant="outline"
            className="mt-4 h-auto rounded-lg px-3 py-2 text-sm font-bold"
          >
            <Link href={nextAction.href}>{nextAction.cta}</Link>
          </Button>
        </article>

        <article
          className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
          data-testid="member-guidance-documents"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            <FileText className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold">{tLanding('guidance_documents_title')}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
            {tLanding('guidance_documents_body')}
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-4 h-auto rounded-lg px-3 py-2 text-sm font-bold"
          >
            <Link href="/member/documents">{tLanding('guidance_documents_cta')}</Link>
          </Button>
        </article>

        <article
          className="rounded-lg border border-slate-200 p-4 dark:border-white/10"
          data-testid="member-guidance-support"
        >
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            <Headphones className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold">{tLanding('guidance_support_title')}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
            {isActive
              ? tLanding('guidance_membership_valid_thru', { validThru })
              : tLanding('guidance_support_inactive_body')}
          </p>
          <Button
            asChild
            variant="outline"
            className="mt-4 h-auto rounded-lg px-3 py-2 text-sm font-bold"
          >
            <Link href={isActive ? supportHref : '/member/membership'}>
              {isActive ? tLanding('guidance_support_cta') : tLanding('guidance_membership_cta')}
            </Link>
          </Button>
        </article>
      </div>
    </section>
  );
}

export async function MemberDashboardView({ data, locale }: MemberDashboardViewProps) {
  const [t, tLanding] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('dashboard.member_landing'),
  ]);
  const { member, claims, activeClaimId, supportHref } = data;
  const activeClaim = claims.find(claim => claim.id === activeClaimId) ?? null;
  const orientationHref = '/member/help';

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
    <div className="space-y-10 pb-10" data-testid="member-dashboard-ready">
      <MemberHeader name={member.name} membershipNumber={member.membershipNumber} />
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
        <section data-testid="member-orientation-card" className="rounded-2xl border p-5 space-y-4">
          <h2 className="text-lg font-semibold">{tLanding('orientation_title')}</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
            <li>{tLanding('orientation_point_one')}</li>
            <li>{tLanding('orientation_point_two')}</li>
          </ul>
          <Button asChild variant="outline" className="rounded-xl">
            <Link href={orientationHref}>{tLanding('orientation_cta')}</Link>
          </Button>
        </section>
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

      <section className="space-y-6">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {tLanding('more_services')}
          </h2>
        </div>

        {/* Adaptive Header Section */}
        <div className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-sky-50/70 p-8 shadow-xl sm:p-10 dark:border-white/10 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
            <div className="flex flex-col gap-8 max-w-xl">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-4 py-1.5 text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
                  <div
                    className={`flex h-2 w-2 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  />
                  <span
                    className="text-[10px] font-black uppercase tracking-[0.2em]"
                    data-testid="dashboard-heading"
                  >
                    {tLanding('page_title')}
                  </span>
                </div>

                <h1 className="text-4xl font-display font-black tracking-tight text-slate-950 md:text-6xl dark:text-white">
                  {tLanding('hero_greeting')},
                  <br />
                  <span className="bg-gradient-to-r from-sky-600 to-blue-700 bg-clip-text text-transparent italic">
                    {userDetails.name.split(' ')[0]}
                  </span>
                </h1>
                <p className="text-lg font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                  {heroSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {tLanding('status_label')}
                    </span>
                    <span className="text-sm font-black uppercase tracking-tighter text-slate-950 dark:text-white">
                      {supportStatusLabel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <Headphones className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {tLanding('response_label')}
                    </span>
                    <span className="text-sm font-black uppercase tracking-tighter text-slate-950 dark:text-white">
                      {tLanding('response_value')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-3 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {tLanding('card_ready_label')}
                    </span>
                    <span className="text-sm font-black uppercase tracking-tighter text-slate-950 dark:text-white">
                      {tLanding('card_ready_value')}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 animate-in fade-in zoom-in-95 duration-1000 delay-300">
              <DigitalIDCard
                name={userDetails.name}
                memberNumber={userDetails.memberNumber || 'PENDING'}
                validThru={validThru}
                isActive={isActive}
                labels={{
                  membership: tLanding('card_membership'),
                  claimSupport: tLanding('card_claim_support'),
                  legalProtection: tLanding('card_legal_protection'),
                  assistance247: tLanding('card_assistance_247'),
                  memberName: tLanding('card_member_name'),
                  validThru: tLanding('card_valid_thru'),
                  activeMember: tLanding('card_active_member'),
                  protectionPaused: tLanding('card_protection_paused'),
                  addToAppleWallet: tLanding('card_add_to_apple_wallet'),
                  googlePayReady: tLanding('card_google_pay_ready'),
                }}
              />
            </div>
          </div>
        </div>

        <div className="relative group cursor-pointer" data-testid="diaspora-ribbon">
          <div className="relative rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300 hover:border-sky-200 dark:border-white/10 dark:bg-slate-950/60">
            <div className="flex items-center gap-5">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300">
                <Globe className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-display font-bold text-foreground">
                  {t('diaspora_ribbon.text')}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {tLanding('diaspora_description')}
                </p>
              </div>
            </div>
            <Button
              asChild
              size="lg"
              className="rounded-2xl px-8 group/btn shadow-sm transition-all active:scale-95"
              data-testid="diaspora-ribbon-cta"
            >
              <Link href="/member/diaspora" className="flex items-center gap-3">
                <span className="font-bold">{t('diaspora_ribbon.cta')}</span>
                <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-1.5 transition-transform duration-300" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Action Center - Primary Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <HomeGrid className="sm:grid-cols-2 gap-6">
              {[
                {
                  href: '/member/incident-guide',
                  id: 'incident',
                  label: t('home_grid.cta_incident'),
                  iconName: 'incident',
                  color: 'from-red-600 to-red-700',
                  description: tLanding('cta_incident_kicker'),
                },
                {
                  href: '/member/claim-report',
                  id: 'report',
                  label: t('home_grid.cta_report'),
                  iconName: 'report',
                  color: 'from-blue-600 to-blue-700',
                  description: tLanding('cta_report_kicker'),
                },
                {
                  href: '/member/green-card',
                  id: 'green-card',
                  label: t('home_grid.cta_green_card'),
                  iconName: 'green-card',
                  color: 'from-emerald-600 to-emerald-700',
                  description: tLanding('cta_green_card_kicker'),
                },
                {
                  href: '/member/benefits',
                  id: 'benefits',
                  label: t('home_grid.cta_benefits'),
                  iconName: 'benefits',
                  color: 'from-amber-400 to-orange-400',
                  description: tLanding('cta_benefits_kicker'),
                },
              ].map(action => (
                <MatteAnchorCard
                  key={action.id}
                  href={action.href}
                  label={action.label}
                  iconName={action.iconName}
                  description={action.description}
                  colorClassName={action.color}
                  testId={`home-cta-${action.id}`}
                />
              ))}
            </HomeGrid>
          </div>

          <Card className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/60">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">
                <Headphones className="w-4 h-4" />
                {tLanding('support_panel_title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8 pt-0 space-y-8">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <span>{tLanding('support_readiness_label')}</span>
                    <span className={isActive ? 'text-emerald-500' : 'text-amber-500'}>
                      {isActive
                        ? tLanding('support_readiness_active')
                        : tLanding('support_readiness_pending')}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
                    <div
                      className={`h-full transition-all duration-1000 ${
                        isActive ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: isActive ? '100%' : '65%' }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      {tLanding('support_channel_label')}
                    </span>
                    <span className="text-xl font-display font-black">
                      {tLanding('support_channel_value')}
                    </span>
                  </div>
                  <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-white/5 dark:bg-white/5">
                    <span className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
                      {tLanding('support_window_label')}
                    </span>
                    <span className="text-xl font-display font-black">
                      {tLanding('support_window_value')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {tLanding('support_highlights_title')}
                </h4>
                <div className="space-y-3">
                  {[
                    tLanding('support_highlight_one'),
                    tLanding('support_highlight_two'),
                    tLanding('support_highlight_three'),
                  ].map(item => (
                    <div key={item} className="flex items-center justify-between">
                      <span className="text-xs font-bold">{item}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {tLanding('online_now')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                asChild
                variant="outline"
                className="w-full rounded-2xl border-sky-200 font-bold transition-all hover:border-sky-300 hover:bg-sky-50 dark:border-sky-400/20 dark:hover:bg-sky-400/5"
              >
                <Link href="/member/help" className="flex items-center justify-center gap-2">
                  <span>{tLanding('support_panel_cta')}</span>
                  <ArrowRight className="w-4 h-4 transition-transform" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Service Tiles - Glass Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xl font-display font-black tracking-tight">
              {tLanding('system_ecosystem')}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary"
            >
              {tLanding('explore_all')} <ArrowRight className="ml-2 w-3 h-3" />
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              {
                key: 'property_damage',
                icon: ShieldCheck,
                desc: tLanding('property_damage_desc'),
              },
              { key: 'health_safety', icon: HeartPulse, desc: tLanding('health_safety_desc') },
              { key: 'my_documents', icon: FileText, desc: tLanding('my_documents_desc') },
              { key: 'contact_center', icon: Headphones, desc: tLanding('contact_center_desc') },
            ].map((cat, i) => (
              <Card
                key={i}
                className="group relative overflow-hidden bg-white/50 dark:bg-white/5 backdrop-blur-sm hover:bg-white dark:hover:bg-white/10 transition-all duration-500 cursor-pointer border-slate-200/60 dark:border-white/10 shadow-sm hover:shadow-xl hover:-translate-y-1 animate-in fade-in slide-in-from-bottom-4"
                style={{ animationDelay: `${(i + 4) * 100}ms` }}
              >
                <CardContent className="p-7 flex flex-col items-center text-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/20 rounded-2xl blur group-hover:blur-md transition-all duration-500" />
                    <div className="relative w-14 h-14 rounded-2xl bg-primary/5 dark:bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all duration-500">
                      <cat.icon className="w-7 h-7" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-sm font-bold block group-hover:text-primary transition-colors">
                      {t(`categories.${cat.key}`)}
                    </span>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      {cat.desc}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2 overflow-hidden rounded-[2rem] border border-slate-200/80 bg-slate-950 text-white shadow-lg dark:border-white/10">
            <CardHeader className="relative border-b border-white/10 p-8 pb-4">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="flex items-center gap-3 text-lg font-display font-black">
                  <div className="rounded-lg bg-sky-500 p-2">
                    <Phone className="h-5 w-5 text-white" />
                  </div>
                  {tLanding('command_center_title')}
                </CardTitle>
                <div className="rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[10px] font-black tracking-widest text-sky-300">
                  {tLanding('priority_line_active')}
                </div>
              </div>
            </CardHeader>

            <div className="relative flex flex-col gap-8 p-8 sm:p-10">
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
                    {tLanding('support_phone_label')}
                  </div>
                  <a href={contacts.telHref} className="block text-3xl font-display font-black">
                    {contacts.phoneDisplay}
                  </a>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span>
                      {tLanding('available_now_avg_response', {
                        seconds: tLanding('response_value'),
                      })}
                    </span>
                  </div>
                </div>
                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/5 p-6">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">
                    {tLanding('support_whatsapp_label')}
                  </div>
                  <a
                    href={contacts.whatsappHref}
                    className="block text-3xl font-display font-black"
                  >
                    WhatsApp
                  </a>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span>{tLanding('support_whatsapp_value')}</span>
                  </div>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                {tLanding('command_center_body')}
              </p>
            </div>
          </Card>

          <div className="flex flex-col gap-8">
            <ReferralCard isAgent={isAgent(userDetails.role)} />
            <Card className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-slate-950/60">
              <div className="relative space-y-5">
                <div className="flex items-center gap-4">
                  <div className="rounded-2xl bg-sky-50 p-3 dark:bg-sky-400/10">
                    <LayoutDashboard className="w-6 h-6 text-sky-700 dark:text-sky-300" />
                  </div>
                  <h3 className="text-lg font-display font-black text-foreground">
                    {tLanding('status_insight_title')}
                  </h3>
                </div>
                <p className="text-sm font-medium leading-relaxed text-muted-foreground">
                  {tLanding('status_insight_body')}
                </p>
                <Button variant="secondary" asChild className="w-full rounded-xl font-bold">
                  <Link href="/member/help">{tLanding('review_security_parameters')}</Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
