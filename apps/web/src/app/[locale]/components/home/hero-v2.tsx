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

  return (
    <section className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-white via-slate-50 to-slate-100/80">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-65">
        <div className="absolute -left-14 top-12 h-72 w-72 rounded-full bg-emerald-200/50 blur-[110px]" />
        <div className="absolute -right-24 top-16 h-80 w-80 rounded-full bg-cyan-200/40 blur-[130px]" />
        <div className="absolute -bottom-20 left-1/4 h-64 w-64 rounded-full bg-amber-200/35 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-6xl space-y-6 px-4 py-12 md:py-16">
        <div className="space-y-5 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_28px_54px_-44px_rgba(15,23,42,0.85)] md:p-8 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
          <div className="space-y-5 rounded-2xl border border-slate-100 bg-white/80 p-3 sm:p-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
              {common('appName')}
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-slate-900 max-[375px]:text-[2rem] md:text-5xl">
              {t('v2.title')}
            </h1>
            <p className="max-w-2xl text-[1.01rem] leading-7 text-slate-600 md:text-lg">
              {t('v2.subtitle')}
            </p>
            {proofChips.length > 0 ? (
              <div
                data-testid="hero-v2-proof-chips"
                className="flex flex-wrap items-center gap-2"
                aria-label="proof chips"
              >
                {proofChips.map(chip => (
                  <span
                    key={chip}
                    data-testid="hero-v2-proof-chip"
                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {telHref ? (
                <a
                  data-testid="hero-v2-help-call"
                  href={telHref}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_16px_30px_-20px_rgba(16,185,129,0.95)] transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 sm:w-auto"
                >
                  <PhoneCall className="h-4 w-4" />
                  {t('v2.helpNow')}
                </a>
              ) : null}
              <Link
                data-testid="hero-v2-start-claim"
                href={startClaimHref}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              >
                {t('v2.start')}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="text-sm font-medium text-slate-500">{t('v2.helpMeta')}</p>

            <div className="flex flex-wrap items-center gap-2">
              {whatsappHref ? (
                <a
                  data-testid="hero-v2-help-whatsapp"
                  href={whatsappHref}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <MessageCircleMore className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              ) : null}
              <Link
                data-testid="hero-v2-invite-chip"
                href="/register"
                className="inline-flex min-h-9 items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              >
                {t('v2.invite')}
              </Link>
            </div>

            <div
              data-testid="hero-v2-digital-id-preview"
              className="max-w-sm rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{t('v2.idTitle')}</p>
                    <p className="text-[11px] text-slate-500">
                      {t('v2.idMeta')}: ID-••••-24 • {t('v2.idPreview')}
                    </p>
                  </div>
                </div>
                <Link
                  data-testid="hero-v2-digital-id-link"
                  href="/member"
                  className="text-xs font-semibold text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                >
                  {t('v2.idLink')}
                </Link>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-[0_20px_36px_-34px_rgba(15,23,42,0.8)]">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                {t('v2.journeyLabel')}
              </p>
              <div className="mt-3 space-y-2">
                {steps.map((step, index) => (
                  <div
                    key={step}
                    className="rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700"
                  >
                    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                      {index + 1}
                    </span>
                    {step}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-[0_20px_36px_-34px_rgba(15,23,42,0.8)]">
              <div
                data-testid="hero-v2-trust-row"
                className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-600"
                aria-label="trust row"
              >
                {trustCues.map(item => (
                  <span
                    key={item}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium tracking-tight text-slate-600"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
