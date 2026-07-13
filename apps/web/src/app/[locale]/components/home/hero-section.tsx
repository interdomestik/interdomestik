import { Link } from '@/i18n/routing';
import { PUBLIC_FREE_START_ANCHOR_HREF } from '@/lib/public-membership-entry';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PublicEntrySecondaryActions, PublicMembershipAction } from './public-entry-actions';

type HeroSectionProps = Readonly<{
  locale?: string;
  primaryHref?: string;
  secondaryHref?: string;
  tenantId?: string | null;
}>;

type MemberContinuationProps = Readonly<{
  primaryHref: string;
  secondaryHref?: string;
}>;

function MemberContinuation({ primaryHref, secondaryHref }: MemberContinuationProps) {
  const t = useTranslations('hero.publicEntry');

  return (
    <div className="max-w-3xl">
      <h1
        id="public-entry-title"
        className="text-balance text-4xl font-bold leading-[1.04] tracking-[-0.035em] text-[hsl(var(--foreground))] sm:text-5xl lg:text-6xl"
      >
        {t('memberTitle')}
      </h1>
      <p className="mt-6 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
        {t('memberSubtitle')}
      </p>
      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Link
          href={primaryHref}
          className="inline-flex min-h-14 items-center justify-center gap-3 rounded-md bg-[hsl(var(--primary))] px-6 py-3 text-center font-semibold text-[hsl(var(--primary-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
        >
          {t('memberPrimary')}
          <ArrowRight aria-hidden="true" className="h-5 w-5" />
        </Link>
        {secondaryHref ? (
          <Link
            href={secondaryHref}
            className="inline-flex min-h-14 items-center justify-center rounded-md border border-slate-300 px-6 py-3 text-center font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2"
          >
            {t('memberSecondary')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function HeroSection({
  primaryHref = PUBLIC_FREE_START_ANCHOR_HREF,
  secondaryHref,
}: HeroSectionProps) {
  const t = useTranslations('hero.publicEntry');
  const isMemberContinuation = primaryHref === '/member';

  return (
    <section
      aria-labelledby="public-entry-title"
      className="overflow-hidden bg-[hsl(var(--background))] pt-20"
      data-testid="public-entry-hero"
    >
      {isMemberContinuation ? (
        <div className="mx-auto grid w-full max-w-[90rem] gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-0 lg:px-10 lg:py-14 xl:px-14">
          <div className="border-b-2 border-[hsl(var(--accent))] pb-5 lg:border-b-0 lg:border-r-2 lg:px-6 lg:py-3">
            <p className="max-w-48 text-xs font-bold uppercase tracking-[0.18em] text-slate-900 sm:text-sm">
              {t('memberEyebrow')}
            </p>
          </div>
          <div className="min-w-0 lg:px-12 xl:px-20">
            <MemberContinuation primaryHref={primaryHref} secondaryHref={secondaryHref} />
          </div>
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-[90rem] gap-0 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-10 lg:py-14 xl:px-14">
          <div className="border-b-2 border-[hsl(var(--accent))] pb-5 lg:rounded-bl-[2rem] lg:border-r-2 lg:px-6 lg:py-3">
            <p className="max-w-48 text-xs font-bold uppercase tracking-[0.18em] text-slate-900 sm:text-sm">
              {t('eyebrow')}
            </p>
          </div>
          <div className="min-w-0 border-b-2 border-[hsl(var(--accent))] py-9 lg:px-12 lg:pt-0 lg:pb-10 xl:px-20">
            <h1
              id="public-entry-title"
              className="max-w-5xl text-balance text-4xl font-bold leading-[1.02] tracking-[-0.04em] text-[hsl(var(--foreground))] sm:text-5xl lg:text-6xl xl:text-7xl"
            >
              {t('title')}
            </h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8">
              {t('subtitle')}
            </p>
            <PublicMembershipAction />
          </div>
          <div aria-hidden="true" className="hidden lg:block" />
          <div className="min-w-0 lg:px-12 xl:px-20">
            <PublicEntrySecondaryActions />
          </div>
        </div>
      )}
    </section>
  );
}
