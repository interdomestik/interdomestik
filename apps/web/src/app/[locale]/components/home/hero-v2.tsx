'use client';

import { Link } from '@/i18n/routing';
import { ArrowRight, MessageCircleMore, PhoneCall, ShieldCheck, Sparkles } from 'lucide-react';
import { getSupportContacts } from '@/lib/support-contacts';
import { useTranslations } from 'next-intl';

type HeroV2Props = {
  locale: string;
  startClaimHref: string;
  tenantId?: string | null;
};

type HeroV2Content = {
  cardBullets: string[];
  footerTrustCues: string[];
  headline: string;
  inviteLabel: string;
  primaryCtaLabel: string;
  primaryCtaMeta: string;
  supportEyebrow: string;
  supportLabel: string;
  subtitle: string;
  topStats: string[];
  whatsappLabel: string;
};

function isPublicMembershipEntry(startClaimHref: string): boolean {
  return startClaimHref === '#free-start-intake' || startClaimHref === '/register';
}

function getMembershipPriceChip(params: { ctaLabel: string; subtitle: string }): string {
  const { ctaLabel, subtitle } = params;
  const subtitleMatch = subtitle.match(/\((€20\/[^)]+)\)/u);

  if (subtitleMatch) {
    return subtitleMatch[1].replace('/', ' / ');
  }

  const ctaMatch = ctaLabel.match(/(€20\/\S+)/u);
  return ctaMatch?.[1].replace('/', ' / ') ?? '€20';
}

function getHeroV2Content(params: {
  isMembershipEntry: boolean;
  proofChips: string[];
  steps: string[];
  t: ReturnType<typeof useTranslations>;
  trustCues: string[];
}): HeroV2Content {
  const { isMembershipEntry, proofChips, steps, t, trustCues } = params;

  if (isMembershipEntry) {
    const ctaLabel = t('cta');
    const subtitle = t('subtitle');

    return {
      cardBullets: [t('badge'), t('callNow'), t('whatsappCta')],
      footerTrustCues: [t('trustedBy'), t('guarantee'), t('digitalCardSticky')],
      headline: t('title'),
      inviteLabel: t('digitalCardSticky'),
      primaryCtaLabel: ctaLabel,
      primaryCtaMeta: t('guarantee'),
      subtitle,
      supportEyebrow: t('badge'),
      supportLabel: t('callNow'),
      topStats: [t('badge'), getMembershipPriceChip({ ctaLabel, subtitle }), t('rating')].filter(
        Boolean
      ),
      whatsappLabel: t('whatsappCta'),
    };
  }

  return {
    cardBullets: steps.slice(0, 3),
    footerTrustCues: trustCues,
    headline: t('v2.title'),
    inviteLabel: t('v2.invite'),
    primaryCtaLabel: t('v2.start'),
    primaryCtaMeta: proofChips[1] ?? t('v2.helpMeta'),
    subtitle: t('v2.subtitle'),
    supportEyebrow: trustCues[0] ?? t('v2.helpMeta'),
    supportLabel: t('v2.helpNow'),
    topStats: [t('badge'), t('activeMembersValue'), t('rating')].filter(Boolean),
    whatsappLabel: t('v2.helpNow'),
  };
}

function getProofChipClassName(index: number): string {
  if (index === 0) {
    return 'text-emerald-300';
  }

  if (index === 2) {
    return 'text-amber-200';
  }

  return 'text-white';
}

export function HeroV2({ locale, startClaimHref, tenantId }: HeroV2Props) {
  const t = useTranslations('hero');
  const common = useTranslations('common');
  const contacts = getSupportContacts({ tenantId, locale });
  const telHref = contacts.telHref;
  const whatsappHref = contacts.whatsappHref;
  const steps = Array.isArray(t.raw('v2.journeySteps'))
    ? (t.raw('v2.journeySteps') as string[])
    : [];
  const proofChips = Array.isArray(t.raw('v2.proofChips'))
    ? (t.raw('v2.proofChips') as string[])
    : [];
  const trustCues = Array.isArray(t.raw('v2.trustCues')) ? (t.raw('v2.trustCues') as string[]) : [];
  const isMembershipEntry = isPublicMembershipEntry(startClaimHref);
  const content = getHeroV2Content({ isMembershipEntry, proofChips, steps, t, trustCues });

  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-[linear-gradient(180deg,#f4f8fb_0%,#ffffff_22%,#eef6f3_100%)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_28%),radial-gradient(circle_at_85%_18%,rgba(14,165,233,0.18),transparent_24%),radial-gradient(circle_at_50%_100%,rgba(245,158,11,0.10),transparent_26%)]" />
        <div className="absolute left-[-10%] top-16 h-72 w-72 rounded-full bg-white/60 blur-3xl" />
        <div className="absolute right-[-8%] top-20 h-80 w-80 rounded-full bg-cyan-100/50 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/60 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-12 md:py-16 lg:py-20">
        <div className="relative overflow-hidden rounded-[2.4rem] border border-white/80 bg-white/62 px-5 py-8 shadow-[0_36px_120px_-56px_rgba(15,23,42,0.42)] backdrop-blur-2xl sm:px-8 lg:px-12 lg:py-12">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.76),rgba(255,255,255,0.32))]" />
          <div
            aria-hidden="true"
            className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
          />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-8 h-40 w-40 -translate-x-1/2 rounded-full bg-cyan-100/70 blur-3xl"
          />

          <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/84 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
              {common('appName')}
            </div>

            {content.topStats.length > 0 ? (
              <div
                data-testid="hero-v2-proof-chips"
                className="mt-8 inline-flex flex-wrap items-center justify-center gap-3 rounded-full border border-slate-900/10 bg-[linear-gradient(180deg,rgba(20,29,49,0.98),rgba(17,24,39,0.92))] px-5 py-3 text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_24px_50px_-30px_rgba(15,23,42,0.85)]"
              >
                {content.topStats.map((chip, index) => (
                  <div key={chip} className="flex items-center gap-3">
                    <span data-testid="hero-v2-proof-chip" className={getProofChipClassName(index)}>
                      {chip}
                    </span>
                    {index < content.topStats.length - 1 ? (
                      <span className="h-4 w-px bg-white/20" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-10 space-y-6">
              <h1 className="mx-auto max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.05em] text-slate-950 max-[375px]:text-[2.2rem] md:text-[4rem]">
                {content.headline}
              </h1>
              <p className="mx-auto max-w-3xl text-balance text-[1.05rem] leading-8 text-slate-600 md:text-[1.24rem]">
                {content.subtitle}
              </p>
            </div>

            <div className="mt-12 flex w-full flex-col gap-3 md:flex-row md:items-stretch">
              <Link
                data-testid="hero-v2-start-claim"
                href={startClaimHref}
                className="group flex flex-1 items-center justify-between rounded-[1.4rem] bg-[linear-gradient(180deg,#0f6b96,#125c86)] px-8 py-5 text-left text-white shadow-[0_32px_64px_-24px_rgba(14,116,144,0.35)] transition duration-300 hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <span>
                  <span className="block text-xl font-semibold md:text-2xl">
                    {content.primaryCtaLabel}
                  </span>
                  <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/85">
                    {content.primaryCtaMeta}
                  </span>
                </span>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/10 transition group-hover:bg-white/20">
                  <ArrowRight className="h-6 w-6" />
                </span>
              </Link>

              <div className="flex flex-col gap-3 min-[480px]:flex-row md:w-auto md:flex-col lg:flex-row">
                {telHref ? (
                  <a
                    data-testid="hero-v2-help-call"
                    href={telHref}
                    className="inline-flex min-h-20 flex-col items-start justify-center rounded-[1.4rem] border border-white/90 bg-white/68 px-6 py-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] transition hover:bg-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">
                      {content.supportEyebrow}
                    </span>
                    <span className="mt-1 inline-flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
                      <PhoneCall className="h-5 w-5 text-slate-700" />
                      {content.supportLabel}
                    </span>
                  </a>
                ) : null}

                {whatsappHref ? (
                  <a
                    data-testid="hero-v2-help-whatsapp"
                    href={whatsappHref}
                    className="inline-flex min-h-20 flex-col items-start justify-center rounded-[1.4rem] border border-emerald-100 bg-[linear-gradient(180deg,rgba(240,253,250,0.96),rgba(236,253,245,0.86))] px-6 py-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-700">
                      WhatsApp
                    </span>
                    <span className="mt-1 inline-flex items-center gap-2 text-2xl font-semibold italic tracking-tight text-slate-950">
                      <MessageCircleMore className="h-5 w-5 text-emerald-700" />
                      {content.whatsappLabel}
                    </span>
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                data-testid="hero-v2-invite-chip"
                href="/register"
                className="inline-flex min-h-10 items-center rounded-full border border-emerald-200/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.98),rgba(220,252,231,0.9))] px-5 py-2 text-sm font-semibold text-emerald-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)] transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                {content.inviteLabel}
              </Link>
            </div>

            <div
              data-testid="hero-v2-digital-id-preview"
              className="relative mt-10 w-full max-w-[25rem] overflow-hidden rounded-[2rem] border border-slate-900/5 bg-[linear-gradient(180deg,rgba(20,29,49,0.98),rgba(19,26,44,0.94))] p-6 text-left text-white shadow-[0_36px_80px_-48px_rgba(15,23,42,0.88)]"
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_36%)]"
              />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/14 bg-white/6 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                      <ShieldCheck className="h-5 w-5 text-white" />
                    </span>
                    <div>
                      <p className="text-3xl font-semibold italic tracking-tight text-white">
                        {common('appName')}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.34em] text-slate-400">
                        {t('v2.idTitle')}
                      </p>
                    </div>
                  </div>
                  <div className="flex h-9 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#f6e8a9,#d1b44a)] text-[10px] font-semibold text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                    ID
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-3 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                  {content.cardBullets.map(item => (
                    <span key={item} className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                      Vlera
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-200">
                      {t('v2.idMeta')}: ID-••••-24
                    </p>
                  </div>
                  <Link
                    data-testid="hero-v2-digital-id-link"
                    href="/member"
                    className="text-xs font-semibold text-emerald-200 underline-offset-2 hover:text-white hover:underline"
                  >
                    {t('v2.idLink')}
                  </Link>
                </div>
              </div>
            </div>

            <div
              data-testid="hero-v2-trust-row"
              className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-slate-600"
            >
              {content.footerTrustCues.map(item => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-white/90 bg-white/72 px-3 py-1.5 text-xs font-medium tracking-tight text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
