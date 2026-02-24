'use client';

import type { MemberDashboardData } from '@interdomestik/domain-member';
import {
  ArrowRight,
  Bell,
  FilePlus2,
  FolderOpen,
  MessageCircleMore,
  Globe2,
  HeartHandshake,
  LifeBuoy,
  PhoneCall,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { FunnelEvents, resolveFunnelVariant } from '@/lib/analytics';
import { getSupportContacts } from '@/lib/support-contacts';

type MemberDashboardV2Props = {
  data: MemberDashboardData;
  locale: string;
  tenantId?: string | null;
};

export function MemberDashboardV2({ data, locale, tenantId }: MemberDashboardV2Props) {
  const t = useTranslations('dashboard.member.home');
  const tClaimStage = useTranslations('claims.stage');
  const contacts = getSupportContacts({ tenantId, locale });
  useEffect(() => {
    FunnelEvents.retentionPulse(
      {
        tenantId: tenantId ?? null,
        variant: resolveFunnelVariant(true),
        locale,
      },
      {
        surface: 'member_dashboard',
      }
    );
  }, [locale, tenantId]);

  const activeClaim = data.claims.find(claim => claim.id === data.activeClaimId) ?? null;
  const knownStages = new Set([
    'draft',
    'submitted',
    'verification',
    'evaluation',
    'negotiation',
    'court',
    'resolved',
    'rejected',
  ]);
  const activeStageLabel =
    activeClaim && knownStages.has(activeClaim.stageKey)
      ? tClaimStage(
          activeClaim.stageKey as
            | 'draft'
            | 'submitted'
            | 'verification'
            | 'evaluation'
            | 'negotiation'
            | 'court'
            | 'resolved'
            | 'rejected'
        )
      : activeClaim?.stageLabel;
  const activeClaimSummary =
    activeClaim && (activeClaim.claimNumber || activeClaim.id)
      ? `${activeClaim.claimNumber ?? activeClaim.id} · ${activeStageLabel}`
      : null;

  const quickActions = [
    {
      testId: 'qa-abroad-help',
      label: t('qa.abroad'),
      href: `/${locale}/member/green-card`,
      icon: Globe2,
    },
    {
      testId: 'qa-help-now',
      label: t('qa.help_now'),
      href: contacts.telHref,
      icon: PhoneCall,
    },
    {
      testId: 'qa-documents',
      label: t('qa.documents'),
      href: `/${locale}/member/documents`,
      icon: FolderOpen,
    },
    {
      testId: 'qa-benefits',
      label: t('qa.benefits'),
      href: `/${locale}/member/benefits`,
      icon: ShieldCheck,
    },
    {
      testId: 'qa-support',
      label: t('qa.support'),
      href: `/${locale}/member/help`,
      icon: LifeBuoy,
    },
    {
      testId: 'qa-start-claim',
      label: t('qa.start_claim'),
      href: `/${locale}/member/claims/new`,
      icon: FilePlus2,
    },
  ];

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-b from-slate-50 via-white to-slate-100 p-2.5 shadow-[0_24px_58px_-44px_rgba(15,23,42,0.7)] sm:p-4 lg:p-5 xl:p-6"
      data-testid="member-dashboard-ready"
      data-ui-v2="true"
    >
      <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden>
        <div className="absolute -left-28 top-10 h-56 w-56 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute -right-16 top-0 h-52 w-52 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-44 w-44 rounded-full bg-amber-200/30 blur-3xl" />
      </div>

      <div className="relative pb-10 sm:space-y-4 lg:grid lg:grid-cols-12 lg:gap-5 lg:space-y-0 xl:gap-6">
        <div className="space-y-3.5 sm:space-y-4 lg:space-y-6 lg:col-span-7 xl:col-span-8">
          <section
            className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-4.5 text-white shadow-[0_26px_54px_-30px_rgba(15,23,42,0.92)] sm:p-5 lg:p-6"
            data-testid="member-hero"
          >
            <div className="pointer-events-none absolute inset-0 opacity-55" aria-hidden="true">
              <div className="absolute -left-16 top-6 h-40 w-40 rounded-full bg-cyan-300/30 blur-3xl" />
              <div className="absolute -right-16 top-16 h-36 w-36 rounded-full bg-emerald-300/30 blur-3xl" />
            </div>
            <div data-testid="member-header" className="relative space-y-3">
              <h1
                className="text-[1.85rem] font-semibold leading-[1.08] tracking-tight text-white max-[375px]:text-[1.62rem] sm:text-[1.95rem] lg:text-3xl xl:text-4xl"
                data-testid="dashboard-heading"
                id="dashboard-heading"
              >
                <span data-testid="member-hero-headline">{t('hero.title')}</span>
              </h1>
              <p
                className="max-w-[34ch] text-[1rem] leading-7 text-slate-200 max-[375px]:text-[0.94rem] max-[375px]:leading-6 lg:text-base lg:leading-relaxed"
                data-testid="member-hero-subline"
              >
                {t('hero.subtitle')}
              </p>
              {activeClaimSummary ? (
                <p
                  data-testid="member-hero-active-claim-summary"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-300/40 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-100"
                >
                  <MessageCircleMore className="h-3.5 w-3.5 text-emerald-200" />
                  {activeClaimSummary}
                </p>
              ) : (
                <p className="text-xs font-medium text-slate-300">{t('claims.empty')}</p>
              )}
              <div
                className="flex flex-wrap items-center gap-2 text-[11px] font-medium leading-4 text-slate-100"
                data-testid="member-hero-trust-row"
              >
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 backdrop-blur">
                  {t('hero.trust.private')}
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 backdrop-blur">
                  {t('hero.trust.support247')}
                </span>
                <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1.5 backdrop-blur">
                  {t('hero.trust.guided')}
                </span>
              </div>
            </div>

            <div
              className="mt-4 flex flex-wrap gap-2.5 lg:gap-3"
              data-testid="member-primary-actions"
            >
              <a
                data-testid="cta-get-help-now"
                href={contacts.telHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-[0.98rem] font-semibold text-slate-900 shadow-[0_10px_22px_-14px_rgba(16,185,129,0.95)] transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 max-[375px]:w-full lg:px-4 lg:py-2.5"
              >
                <PhoneCall className="h-[17px] w-[17px]" />
                {t('cta.help_now')}
              </a>
              <a
                data-testid="member-start-claim-cta"
                href={`/${locale}/member/claims/new`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-[0.98rem] font-medium text-white shadow-[0_8px_18px_-14px_rgba(255,255,255,0.55)] backdrop-blur transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 max-[375px]:w-full lg:px-4 lg:py-2.5"
              >
                <span data-testid="cta-start-claim">{t('cta.start_claim')}</span>
                <ArrowRight className="h-[17px] w-[17px]" />
              </a>
            </div>
          </section>

          <section
            className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.7)] backdrop-blur lg:p-6"
            data-testid="member-benefits"
          >
            <h2 className="text-base font-semibold tracking-tight text-slate-900 lg:text-lg">
              {t('benefits.title')}
            </h2>
            <div
              className="mt-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-cyan-50 p-4"
              data-testid="diaspora-ribbon"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-emerald-950">
                  {t('benefits.diaspora.body')}
                </p>
                <a
                  data-testid="diaspora-ribbon-cta"
                  href={`/${locale}/member/diaspora`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                >
                  <Globe2 className="h-4 w-4" />
                  {t('qa.abroad')}
                </a>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:gap-4 xl:gap-5">
              <div
                className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_16px_28px_-28px_rgba(15,23,42,0.7)]"
                data-testid="benefit-card-abroad"
              >
                <h3 className="flex items-center gap-2 text-[1.01rem] font-semibold text-slate-900">
                  <Globe2 className="h-4.5 w-4.5 text-cyan-700" />
                  {t('benefits.abroad.title')}
                </h3>
                <p className="mt-1.5 text-sm leading-5 text-slate-600 lg:leading-relaxed">
                  {t('benefits.abroad.body')}
                </p>
              </div>
              <div
                className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_16px_28px_-28px_rgba(15,23,42,0.7)]"
                data-testid="benefit-card-diaspora"
              >
                <h3 className="flex items-center gap-2 text-[1.01rem] font-semibold text-slate-900">
                  <HeartHandshake className="h-4.5 w-4.5 text-emerald-700" />
                  {t('benefits.diaspora.title')}
                </h3>
                <p className="mt-1.5 text-sm leading-5 text-slate-600 lg:leading-relaxed">
                  {t('benefits.diaspora.body')}
                </p>
              </div>
              <div
                className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_16px_28px_-28px_rgba(15,23,42,0.7)]"
                data-testid="benefit-card-fast-assistance"
              >
                <h3 className="flex items-center gap-2 text-[1.01rem] font-semibold text-slate-900">
                  <PhoneCall className="h-4.5 w-4.5 text-blue-700" />
                  {t('benefits.fast.title')}
                </h3>
                <p className="mt-1.5 text-sm leading-5 text-slate-600 lg:leading-relaxed">
                  {t('benefits.fast.body')}
                </p>
              </div>
            </div>
          </section>

          <section
            className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.7)] backdrop-blur lg:p-6"
            data-testid="member-quick-actions"
          >
            <h2 className="text-base font-semibold tracking-tight text-slate-900 lg:text-lg">
              {t('qa.title')}
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:gap-4">
              {quickActions.map(action => (
                <a
                  key={action.testId}
                  data-testid={action.testId}
                  href={action.href}
                  className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-center text-[0.97rem] font-medium leading-5 text-slate-800 shadow-[0_10px_18px_-22px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm max-[375px]:text-[0.92rem]"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50 transition group-hover:bg-slate-100">
                    <action.icon className="h-[17px] w-[17px] shrink-0 text-slate-500 transition group-hover:text-slate-700" />
                  </span>
                  <span>{action.label}</span>
                </a>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                data-testid="home-cta-incident"
                href={`/${locale}/member/incident-guide`}
                className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {t('qa.incident_guide')}
              </a>
              <a
                data-testid="home-cta-report"
                href={`/${locale}/member/claim-report`}
                className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {t('qa.start_claim')}
              </a>
              <a
                data-testid="home-cta-green-card"
                href={`/${locale}/member/green-card`}
                className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {t('qa.abroad')}
              </a>
              <a
                data-testid="home-cta-benefits"
                href={`/${locale}/member/benefits`}
                className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              >
                {t('qa.benefits')}
              </a>
            </div>

            <a
              data-testid="chip-invite-earn"
              href={`/${locale}/member`}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              <HeartHandshake className="h-3.5 w-3.5" />
              {t('chip.invite_earn')}
            </a>
          </section>

          <section
            className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.7)] backdrop-blur lg:p-6"
            data-testid="member-how-it-works"
          >
            <h2 className="text-base font-semibold tracking-tight text-slate-900 lg:text-lg">
              {t('how.title')}
            </h2>
            <ol className="mt-3 space-y-2.5 text-[0.98rem] text-slate-700 max-[375px]:text-[0.94rem]">
              <li
                data-testid="how-step-1"
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  1
                </span>
                {t('how.step1')}
              </li>
              <li
                data-testid="how-step-2"
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  2
                </span>
                {t('how.step2')}
              </li>
              <li
                data-testid="how-step-3"
                className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  3
                </span>
                {t('how.step3')}
              </li>
            </ol>
          </section>
        </div>

        <div className="mt-3.5 space-y-3.5 sm:space-y-4 lg:col-span-5 lg:mt-0 lg:space-y-6 xl:col-span-4">
          <section
            className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.7)] backdrop-blur lg:p-6"
            data-testid="member-claims-module"
          >
            <h2
              className="text-base font-semibold tracking-tight text-slate-900 lg:text-lg"
              data-testid="member-active-claim"
            >
              {t('claims.title')}
            </h2>
            {activeClaim ? (
              <div
                className="mt-3 space-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3"
                data-testid="claims-module-state-active"
              >
                <p className="text-sm text-slate-800">
                  {t('claims.next_step_label')}:{' '}
                  <span className="font-medium">{activeClaim.claimNumber ?? activeClaim.id}</span>
                </p>
                <p className="text-sm text-slate-700">
                  {t('claims.status_label')}: {activeStageLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    data-testid="cta-continue-claim"
                    href={`/${locale}/member/claims/${activeClaim.id}`}
                    className="inline-flex min-h-11 items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-900 transition hover:bg-emerald-100"
                  >
                    {t('claims.continue')}
                  </a>
                  {activeClaim.nextMemberAction ? (
                    <a
                      href={activeClaim.nextMemberAction.href}
                      className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
                    >
                      {activeClaim.nextMemberAction.label}
                    </a>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                data-testid="claims-module-state-empty"
                className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm text-slate-700">{t('claims.empty')}</p>
                <a
                  data-testid="cta-start-claim-from-claims-module"
                  href={`/${locale}/member/claims/new`}
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-100"
                >
                  {t('claims.start')}
                </a>
              </div>
            )}
          </section>

          <section
            className="rounded-2xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.7)] backdrop-blur lg:p-6"
            data-testid="member-center"
          >
            <h2 className="text-base font-semibold tracking-tight text-slate-900 lg:text-lg">
              {t('center.title')}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:gap-4">
              <a
                data-testid="member-center-notifications"
                href={`/${locale}/member/settings`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[0.98rem] text-slate-800 transition hover:bg-slate-50 max-[375px]:text-[0.94rem]"
              >
                <Bell className="h-[17px] w-[17px] text-slate-500" />
                {t('center.notifications')}
              </a>
              <a
                data-testid="member-center-profile"
                href={`/${locale}/member/settings`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[0.98rem] text-slate-800 transition hover:bg-slate-50 max-[375px]:text-[0.94rem]"
              >
                <UserRound className="h-[17px] w-[17px] text-slate-500" />
                {t('center.profile')}
              </a>
              <a
                data-testid="member-support-link"
                href={`/${locale}/member/help`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[0.98rem] text-slate-800 transition hover:bg-slate-50 max-[375px]:text-[0.94rem]"
              >
                <LifeBuoy className="h-[17px] w-[17px] text-slate-500" />
                <span data-testid="member-center-support">{t('center.support')}</span>
              </a>
            </div>
          </section>

          <section
            className="rounded-2xl border border-slate-200/70 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-[0_20px_40px_-28px_rgba(15,23,42,0.9)] lg:p-6"
            data-testid="member-trust-footer"
          >
            <p className="text-sm font-semibold text-white">{t('footer.privacy')}</p>
            <p className="mt-1 text-xs text-slate-200">{t('footer.security')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
