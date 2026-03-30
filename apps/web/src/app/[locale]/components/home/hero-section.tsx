import { Link } from '@/i18n/routing';
import { getSupportContacts } from '@/lib/support-contacts';
import { Button } from '@interdomestik/ui';
import { ArrowRight, CheckCircle2, Clock, Shield, ShieldCheck, Star, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DigitalIDCard } from './digital-id-card';

type HeroSectionProps = {
  locale?: string;
  primaryHref?: string;
  secondaryHref?: string;
  tenantId?: string | null;
};

export function HeroSection({
  locale,
  primaryHref = '/register',
  secondaryHref = '#free-start-intake',
  tenantId,
}: HeroSectionProps) {
  const t = useTranslations('hero');
  const contacts = getSupportContacts({ locale, tenantId });
  const whatsappHref = contacts.whatsappHref;
  const title = t('title');
  const titleHasQuestionBreak = title.includes('?');
  const titleLead = titleHasQuestionBreak ? `${title.split('?').slice(0, -1).join('?')}?` : title;
  const titleAccent = titleHasQuestionBreak ? (title.split('?').slice(-1)[0]?.trim() ?? '') : '';

  return (
    <section className="relative overflow-hidden bg-[#FAF9F6] pt-20 lg:min-h-[88vh]">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#ffffff_0%,transparent_60%)] opacity-40" />
        <div className="absolute top-[-10%] right-[-5%] h-[40rem] w-[40rem] rounded-full bg-[#1d4ed8]/[0.03] blur-[120px]" />
      </div>

      <div className="container relative z-10 mx-auto px-4 py-12 lg:py-20">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-center">
          <div className="animate-fade-in text-center lg:text-left">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-slate-200/60 bg-white/50 px-5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur-md sm:text-sm">
              <span className="font-bold uppercase tracking-[0.15em] text-[#1d4ed8]">
                {t('primaryMeta')}
              </span>
              <div className="h-3.5 w-px bg-slate-300/80" />
              <div className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-slate-900 text-slate-900" />
                <span className="font-bold text-slate-900">4.9</span>
              </div>
            </div>

            <div className="mb-10 group">
              <h1 className="mb-2 text-4xl font-display font-bold leading-[1.05] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-[4.25rem]">
                {titleLead}
              </h1>
              {titleAccent ? (
                <div className="relative mb-6 block">
                  <span className="relative block text-[2.4rem] font-display font-black leading-[0.98] tracking-[-0.05em] text-[#1d3557] sm:text-[4rem] lg:text-[4.6rem]">
                    {titleAccent}
                  </span>
                </div>
              ) : null}
              <p className="mx-auto max-w-[34rem] text-balance text-[1.05rem] font-medium leading-[1.65] text-slate-500 sm:text-lg lg:mx-0 lg:text-[1.15rem]">
                {t('subtitle')}
              </p>
            </div>

            <div className="animate-slide-up">
              <div className="mx-auto flex w-full max-w-xl flex-col gap-3 lg:mx-0">
                <Link href={primaryHref} className="w-full">
                  <Button
                    size="xl"
                    className="group relative h-16 w-full overflow-hidden rounded-2xl border border-slate-900 bg-[#111827] px-8 text-lg font-bold text-white shadow-[0_20px_40px_-12px_rgba(15,23,42,0.25)] transition-all hover:shadow-[0_25px_50px_-12px_rgba(15,23,42,0.3)] sm:text-xl"
                  >
                    <div className="absolute inset-x-0 top-0 h-[1px] bg-white/10" />
                    <span className="flex items-center gap-2">
                      {t('cta')}
                      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Button>
                </Link>

                <div className="grid w-full gap-3 sm:grid-cols-2">
                  {secondaryHref ? (
                    <Link href={secondaryHref} className="w-full">
                      <Button
                        variant="outline"
                        size="xl"
                        className="h-16 w-full rounded-2xl border border-slate-200 bg-white/60 px-6 text-slate-900 shadow-sm backdrop-blur-md hover:bg-white/80"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#1d4ed8]">
                            {t('urgentEyebrow')}
                          </span>
                          <span className="text-base font-bold leading-none">{t('callNow')}</span>
                        </div>
                      </Button>
                    </Link>
                  ) : null}
                  {whatsappHref ? (
                    <a href={whatsappHref} className="w-full">
                      <Button
                        variant="outline"
                        size="xl"
                        className="h-16 w-full rounded-2xl border border-slate-200 bg-white/40 px-6 text-slate-900 shadow-sm backdrop-blur-md hover:bg-white/60"
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="mb-0.5 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
                            WHATSAPP
                          </span>
                          <span className="text-base font-bold leading-none">
                            {t('whatsappCta')}
                          </span>
                        </div>
                      </Button>
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-6 animate-fade-in lg:items-end">
            <div className="w-full max-w-[27rem] rounded-[2.5rem] border border-white/80 bg-white/40 p-5 shadow-[0_32px_64px_-16px_rgba(15,23,42,0.06)] backdrop-blur-3xl">
              <div className="mb-5 inline-flex items-center gap-2.5 px-2 text-xs font-semibold tracking-wide text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {t('digitalCardSticky')}
              </div>

              <div className="transition-transform duration-700 hover:scale-[1.02]">
                <DigitalIDCard
                  labels={{
                    membership: t('cardMembership'),
                    claimSupport: t('cardClaimSupport'),
                    legalProtection: t('cardLegalProtection'),
                    assistance247: t('cardMemberSupport'),
                    memberName: t('cardMemberName'),
                    validThru: t('cardValidThru'),
                    activeMember: t('cardActiveMember'),
                    protectionPaused: t('cardProtectionPaused'),
                    addToAppleWallet: t('cardAppleWallet'),
                    googlePayReady: t('cardGooglePay'),
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className="mx-auto mt-14 grid w-full max-w-6xl grid-cols-1 gap-4 animate-slide-up md:grid-cols-3"
          style={{ animationDelay: '0.2s' }}
        >
          <div className="flex items-center gap-4 rounded-3xl border border-white/60 bg-white/40 p-5 shadow-[0_16px_32px_-8px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all hover:shadow-[0_24px_48px_-12px_rgba(15,23,42,0.1)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111827] shadow-[0_12px_24px_-8px_rgba(15,23,42,0.3)]">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-lg font-bold tracking-tight text-slate-900">
                {t('activeMembersValue')}
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t('activeMembersLabel')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl border border-white/60 bg-white/40 p-5 shadow-[0_16px_32px_-8px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all hover:shadow-[0_24px_48px_-12px_rgba(15,23,42,0.1)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1d4ed8] shadow-[0_12px_24px_-8px_rgba(29,78,216,0.3)]">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div className="text-left">
              <div className="text-lg font-bold tracking-tight text-slate-900">
                {t('legalProtectionValue')}
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t('legalProtectionLabel')}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-3xl border border-white/60 bg-white/40 p-5 shadow-[0_16px_32px_-8px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all hover:shadow-[0_24px_48px_-12px_rgba(15,23,42,0.1)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
              <Clock className="h-5 w-5 text-[#1d4ed8]" />
            </div>
            <div className="text-left">
              <div className="text-lg font-bold tracking-tight text-slate-900">
                {t('caseOpeningValue')}
              </div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {t('caseOpeningLabel')}
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-12 flex flex-wrap justify-center gap-8 animate-fade-in lg:justify-start"
          style={{ animationDelay: '0.4s' }}
        >
          <span className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Shield className="h-4 w-4 text-slate-300" />
            {t('trustBadgeSecurity')}
          </span>
          <span className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
            <Star className="h-4 w-4 text-slate-300" />
            {t('trustBadgeSupport')}
          </span>
          <span className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-slate-400">
            <CheckCircle2 className="h-4 w-4 text-slate-300" />
            {t('trustBadgeService')}
          </span>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 right-0 h-[24rem] w-[24rem] translate-x-1/4 rounded-full bg-slate-400/[0.03] blur-[110px]" />
    </section>
  );
}
