import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import {
  Bell,
  Car,
  ChevronRight,
  FileText,
  Handshake,
  MapPinned,
  Plane,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { ActiveCaseSummary } from './active-case-summary';
import { getCachedClaimDocumentCount } from './data';
import { DocumentVaultSummary } from './document-vault-summary';
import { getRoleRedirect } from './helpers';
import { resolveMemberHomeHero, type MemberHomeHeroModel } from './hero-resolver';
import { MainServiceCard } from './main-service-card';
import { MobileBottomNav } from './mobile-bottom-nav';
import { NextStepCard, type NextStepModel } from './next-step-card';
import { PrimaryActionPanel } from './primary-action-panel';
import { TrustStrip } from './trust-strip';
import type { DashboardClaim, DashboardTranslator, MemberDashboardViewProps } from './types';

export type { MemberDashboardViewProps } from './types';

const OPEN_STATUSES = new Set([
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
]);

export async function MemberDashboardView({
  dataPromise,
  supplementalDataPromise,
  locale,
}: Readonly<MemberDashboardViewProps>) {
  const memberHomeTranslationsPromise = getTranslations('dashboard.member_assistance');
  const [memberHomeTranslations, data, supplementalData] = await Promise.all([
    memberHomeTranslationsPromise,
    dataPromise,
    supplementalDataPromise,
  ]);
  const t = memberHomeTranslations as unknown as DashboardTranslator;
  const { member, claims } = data;
  const activeClaim = data.activeClaimId
    ? (claims.find(claim => claim.id === data.activeClaimId) ?? null)
    : null;

  const redirectPath = getRoleRedirect(member.role);
  if (redirectPath) {
    redirect(redirectPath);
  }

  const [claimEligibleSubscription, documentsCount] = supplementalData;

  const isActive = Boolean(claimEligibleSubscription);
  const hasAssistanceAccess = isActive || member.role === 'agent';
  const activeCases = claims.filter(claim => OPEN_STATUSES.has(claim.status));
  const hero = resolveMemberHomeHero({
    activeClaim,
    isActive: hasAssistanceAccess,
    locale,
  });
  const nextStep = getNextStep({
    activeClaim,
    hasClaims: claims.length > 0,
    isActive: hasAssistanceAccess,
    locale,
    t,
  });

  const serviceCards = [
    {
      key: 'helpNow',
      href: `/${locale}/member/green-card`,
      icon: MapPinned,
      testId: 'home-cta-green-card',
    },
    {
      key: 'reportClaim',
      href: `/${locale}/member/claim-report`,
      icon: FileText,
      testId: 'home-cta-report',
    },
    {
      key: 'complaint',
      href: `/${locale}/member/help`,
      icon: ShieldAlert,
    },
    {
      key: 'flightDelay',
      href: `/${locale}/member/diaspora`,
      icon: Plane,
      testId: 'diaspora-ribbon-cta',
    },
    {
      key: 'recovery',
      href: `/${locale}/member/help`,
      icon: Handshake,
    },
  ];

  return (
    <main
      aria-labelledby="dashboard-heading"
      className="min-h-dvh min-w-0 overflow-x-hidden bg-[#f4f7f5] px-3 py-2 text-slate-950 md:px-5 md:py-3 lg:px-8"
      data-testid="member-dashboard-ready"
    >
      <div className="mx-auto flex max-w-[920px] flex-col gap-2 pb-[6.5rem] md:block md:space-y-4 md:pb-10">
        <MemberTopBar isActive={hasAssistanceAccess} t={t} />

        <div className="space-y-1.5 md:space-y-4" data-testid="member-dashboard-priority-region">
          <MemberHero hero={hero} isActive={hasAssistanceAccess} t={t} />

          <div className="hidden md:block">
            <NextStepCard nextStep={nextStep} t={t} />
          </div>

          {!hasAssistanceAccess ? (
            <section
              className="hidden rounded-[1.5rem] border border-amber-300 bg-amber-50 p-5 md:block"
              data-testid="member-inactive-boundary"
            >
              <h2 className="text-lg font-semibold text-amber-950">{t('inactive.title')}</h2>
              <p className="mt-2 text-sm leading-6 text-amber-950">{t('inactive.body')}</p>
              <a
                href={`/${locale}/member/membership`}
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-amber-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-900 focus-visible:ring-offset-2 sm:w-auto"
              >
                {t('inactive.cta')}
              </a>
            </section>
          ) : null}
        </div>

        <div
          className="min-h-0 flex-1 space-y-2 md:space-y-4"
          data-testid="member-dashboard-secondary-region"
        >
          <section
            aria-labelledby="member-main-services-heading"
            className="space-y-2 max-[360px]:space-y-0 md:space-y-4"
          >
            <div className="flex items-end justify-between gap-3 max-[360px]:hidden md:block">
              <p className="hidden text-xs font-semibold uppercase tracking-wide text-emerald-800 md:block">
                {t('services.kicker')}
              </p>
              <h2
                id="member-main-services-heading"
                className="hidden text-base font-bold tracking-tight text-slate-950 md:mt-1 md:block md:text-2xl md:font-semibold"
              >
                {t('services.title')}
              </h2>
            </div>
            <div className="flex items-start justify-between gap-1 px-1 md:grid md:grid-cols-2 md:gap-3 md:px-0">
              {serviceCards.map(service => {
                const card = (
                  <div key={service.key} data-testid="member-service-ecosystem-card">
                    <MainServiceCard
                      key={service.key}
                      href={service.href}
                      icon={service.icon}
                      mobileLabel={t(`services.cards.${service.key}.mobile`)}
                      situation={t(`services.cards.${service.key}.situation`)}
                      testId={service.testId}
                      title={t(`services.cards.${service.key}.title`)}
                    />
                  </div>
                );

                if (service.key !== 'flightDelay') return card;

                return (
                  <div
                    key={service.key}
                    data-testid="diaspora-ribbon"
                    className="col-span-1 md:col-span-1"
                  >
                    {card}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="hidden min-[380px]:block md:hidden">
            <NextStepCard compact nextStep={nextStep} t={t} />
          </div>

          <div
            data-testid="member-upsell-banner"
            className="hidden pt-0.5 min-[380px]:block md:block"
          >
            <PrimaryActionPanel locale={locale} t={t} />
          </div>

          <div className="hidden space-y-4 md:block">
            <ActiveCaseSummary activeCases={activeCases} locale={locale} t={t} />
            <DocumentVaultSummary
              documentsCount={documentsCount}
              hasActiveCases={activeCases.length > 0}
              locale={locale}
              t={t}
            />
            <TrustStrip locale={locale} t={t} />
          </div>
        </div>
      </div>
      <MobileBottomNav
        labels={{
          cases: t('bottomNav.cases'),
          documents: t('bottomNav.documents'),
          help: t('bottomNav.help'),
          home: t('bottomNav.home'),
          label: t('bottomNav.label'),
          more: t('bottomNav.more'),
        }}
        locale={locale}
      />
    </main>
  );
}

export async function getDashboardSupplementalData({
  memberId,
  tenantId,
}: {
  memberId: string;
  tenantId: string | null;
}) {
  if (!tenantId) {
    return [null, 0] as const;
  }

  const [subscriptionResult, documentsCountResult] = await Promise.allSettled([
    getActiveSubscription(memberId, tenantId),
    getCachedClaimDocumentCount(memberId, tenantId),
  ]);

  if (subscriptionResult.status === 'rejected') {
    console.error(
      '[MemberDashboardView] Active subscription lookup failed:',
      subscriptionResult.reason
    );
  }

  if (documentsCountResult.status === 'rejected') {
    console.error(
      '[MemberDashboardView] Document summary lookup failed:',
      documentsCountResult.reason
    );
  }

  return [
    subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : null,
    documentsCountResult.status === 'fulfilled' ? documentsCountResult.value : 0,
  ] as const;
}

function MemberTopBar({ isActive, t }: { isActive: boolean; t: DashboardTranslator }) {
  const brand = t('header.brand');
  const mobileBrand = brand.split(' ')[0] ?? brand;

  return (
    <header
      className="flex min-h-14 items-center justify-between gap-3 bg-transparent px-1 py-1 md:min-h-16 md:rounded-[1.6rem]"
      data-testid="member-app-header"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-label={t('header.logoAlt')}
          role="img"
          className="h-9 w-9 shrink-0 rounded-2xl bg-cover bg-center shadow-sm shadow-emerald-900/10 md:h-11 md:w-11"
          style={{ backgroundImage: 'url(/icon-192.png)' }}
        />
        <div className="min-w-0">
          <p className="truncate text-[1.1rem] font-bold uppercase tracking-wide leading-none text-[#0e5c2b] sm:text-xl">
            <span className="md:hidden">{mobileBrand}</span>
            <span className="hidden md:inline">{brand}</span>
          </p>
          <p className="mt-[3px] truncate text-[0.65rem] font-semibold leading-none text-slate-600">
            {t('header.tagline')}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden rounded-full border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-sm sm:inline-flex">
          {isActive ? t('welcome.active') : t('welcome.inactive')}
        </span>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-800 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 md:h-11 md:w-11"
          aria-label={t('header.notifications')}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-slate-800 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 md:h-11 md:w-11 md:hidden"
          aria-label={t('header.profile')}
        >
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function MemberHero({
  hero,
  isActive,
  t,
}: {
  hero: MemberHomeHeroModel;
  isActive: boolean;
  t: DashboardTranslator;
}) {
  return (
    <section
      aria-labelledby="dashboard-heading"
      className="px-1 pb-3 pt-3 md:px-0 md:pb-8 md:pt-6"
      data-hero-state={hero.state}
      data-testid="member-welcome-status"
    >
      <div>
        <span
          className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-emerald-900/15 bg-white/70 px-3 py-1.5 text-[0.55rem] font-extrabold uppercase tracking-widest text-[#0e5c2b] shadow-sm shadow-emerald-900/5 md:min-h-10 md:px-3 md:py-2 md:text-xs"
          data-testid="member-home-hero-state"
        >
          <Car className="h-3 w-3" aria-hidden="true" />
          <span className="truncate">{t(`${hero.copyKey}.kicker`)}</span>
          <span className="sr-only">{isActive ? t('welcome.active') : t('welcome.inactive')}</span>
        </span>
        <h1
          id="dashboard-heading"
          data-testid="dashboard-heading"
          className="mt-3 max-w-[21rem] text-[1.42rem] font-extrabold leading-[1.08] tracking-tight text-slate-900 min-[390px]:text-[1.58rem] md:mt-5 md:max-w-3xl md:text-4xl"
        >
          {t(`${hero.copyKey}.title`)}
          <span className="mt-1.5 block font-bold text-[#0e5c2b]">
            {t(`${hero.copyKey}.highlight`)}
          </span>
        </h1>
        <p className="mt-2 max-w-[22rem] text-[0.76rem] font-medium leading-snug text-slate-700 min-[390px]:text-[0.82rem] md:mt-4 md:max-w-2xl md:text-base md:leading-7">
          {t(`${hero.copyKey}.body`)}
        </p>

        <div
          className="mt-3 grid max-w-[22rem] grid-cols-2 gap-2 md:mt-5 md:max-w-xl md:gap-3"
          data-testid="member-hero-value-row"
        >
          <div className="rounded-2xl border border-emerald-900/10 bg-white/80 p-3 shadow-sm shadow-emerald-900/5">
            <p className="text-[0.58rem] font-extrabold uppercase tracking-widest text-slate-500 md:text-xs">
              {t(`${hero.copyKey}.valueLabel`)}
            </p>
            <p className="mt-1 text-sm font-extrabold leading-tight text-slate-950 md:text-lg">
              {t(`${hero.copyKey}.value`)}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-900/10 bg-white/80 p-3 shadow-sm shadow-emerald-900/5">
            <p className="text-[0.58rem] font-extrabold uppercase tracking-widest text-slate-500 md:text-xs">
              {t('heroResolver.nextActionLabel')}
            </p>
            <p className="mt-1 text-sm font-extrabold leading-tight text-slate-950 md:text-lg">
              {t(`${hero.copyKey}.cta`)}
            </p>
          </div>
        </div>

        <div
          className="mt-3 flex max-w-[22rem] flex-col gap-2.5 md:mt-5 md:max-w-sm"
          data-testid="member-primary-actions"
        >
          <a
            data-testid={hero.primaryTestId}
            href={hero.href}
            className="flex min-h-14 w-full items-center justify-between rounded-[1.1rem] bg-[#0e5c2b] px-5 py-3 text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-[#09421f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-2 active:scale-[0.98] active:opacity-90 md:min-h-16 md:px-5 md:py-4"
          >
            <span className="flex min-w-0 items-center">
              <span className="truncate text-sm font-extrabold leading-tight md:text-base">
                {t(`${hero.copyKey}.cta`)}
              </span>
            </span>
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function getNextStep(params: {
  activeClaim: DashboardClaim | null;
  hasClaims: boolean;
  isActive: boolean;
  locale: string;
  t: DashboardTranslator;
}): NextStepModel {
  const { activeClaim, hasClaims, isActive, locale, t } = params;

  if (!isActive) {
    return {
      body: t('nextStep.activate.body'),
      href: `/${locale}/member/membership`,
      label: t('nextStep.activate.cta'),
      testId: 'next-step-activate-membership',
      title: t('nextStep.activate.title'),
    };
  }

  if (!hasClaims) {
    return {
      body: t('nextStep.firstCase.body'),
      href: `/${locale}/member/claims/new`,
      label: t('nextStep.firstCase.cta'),
      testId: 'next-step-open-first-case',
      title: t('nextStep.firstCase.title'),
    };
  }

  if (activeClaim?.requiresMemberAction && activeClaim.nextMemberAction) {
    const uploadKey =
      activeClaim.nextMemberAction.actionType === 'upload_document'
        ? 'missingDocs'
        : 'memberAction';
    return {
      body: t(`nextStep.${uploadKey}.body`),
      href: activeClaim.nextMemberAction.href,
      label: activeClaim.nextMemberAction.label,
      testId: `next-step-${uploadKey}`,
      title: t(`nextStep.${uploadKey}.title`),
    };
  }

  if (activeClaim && /authorization|authorisation|autoriz/i.test(activeClaim.stageKey)) {
    return {
      body: t('nextStep.authorization.body'),
      href: `/${locale}/member/claims/${activeClaim.id}`,
      label: t('nextStep.authorization.cta'),
      testId: 'next-step-authorization',
      title: t('nextStep.authorization.title'),
    };
  }

  if (activeClaim) {
    return {
      body: t('nextStep.review.body'),
      href: `/${locale}/member/claims/${activeClaim.id}`,
      label: t('nextStep.review.cta'),
      testId: 'next-step-review',
      title: t('nextStep.review.title'),
    };
  }

  return {
    body: t('nextStep.history.body'),
    href: `/${locale}/member/claims`,
    label: t('nextStep.history.cta'),
    testId: 'next-step-history',
    title: t('nextStep.history.title'),
  };
}
