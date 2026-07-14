import { Link } from '@/i18n/routing';
import { PUBLIC_FREE_START_ANCHOR_HREF } from '@/lib/public-membership-entry';
import { getSupportContacts } from '@/lib/support-contacts';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  PublicMembershipAction,
  PublicSituationActions,
  PublicSupportPanel,
} from './public-entry-actions';

type HeroSectionProps = Readonly<{
  locale?: string;
  primaryHref?: string;
  secondaryHref?: string;
  tenantId?: string | null;
}>;

function MemberContinuation({
  primaryHref,
  secondaryHref,
}: Pick<HeroSectionProps, 'primaryHref' | 'secondaryHref'>) {
  const t = useTranslations('hero.publicEntry');
  return (
    <div className="mx-auto w-full max-w-[90rem] px-4 py-16 sm:px-6 lg:px-10 xl:px-14">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#006A70]">
        {t('memberEyebrow')}
      </p>
      <h1
        id="public-entry-title"
        className="mt-5 max-w-4xl text-balance text-4xl font-bold leading-tight text-[#001A33] sm:text-6xl"
      >
        {t('memberTitle')}
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-[#334D5C]">{t('memberSubtitle')}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href={primaryHref ?? '/member'}
          className="inline-flex min-h-12 items-center justify-center gap-3 bg-[#006A70] px-6 py-3 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
        >
          {t('memberPrimary')}
          <ArrowRight aria-hidden="true" className="h-5 w-5" />
        </Link>
        {secondaryHref ? (
          <Link
            href={secondaryHref}
            className="inline-flex min-h-12 items-center justify-center border border-[#006A70] px-6 py-3 font-semibold text-[#005F64] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
          >
            {t('memberSecondary')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function HeroSection({
  locale,
  primaryHref = PUBLIC_FREE_START_ANCHOR_HREF,
  secondaryHref,
  tenantId,
}: HeroSectionProps) {
  const t = useTranslations('hero.publicEntry');
  const isMemberContinuation = primaryHref === '/member';
  const contacts = getSupportContacts({ locale, tenantId });

  return (
    <section
      aria-labelledby="public-entry-title"
      className="overflow-hidden bg-[#F9F6F0] text-[#001A33]"
      data-testid="public-entry-hero"
    >
      {isMemberContinuation ? (
        <MemberContinuation primaryHref={primaryHref} secondaryHref={secondaryHref} />
      ) : (
        <div className="mx-auto grid w-full max-w-[90rem] gap-x-12 gap-y-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(32rem,1.18fr)] lg:px-10 lg:py-16 xl:gap-x-20 xl:px-14">
          <div className="min-w-0 lg:pt-3">
            <p className="flex items-center gap-4 text-base font-bold uppercase tracking-[0.16em] text-[#006A70] sm:text-lg">
              <span aria-hidden="true" className="h-px w-10 bg-[#006A70]" />
              {t('eyebrow')}
            </p>
            <h1
              id="public-entry-title"
              className="mt-8 max-w-[11ch] text-balance font-serif text-5xl font-semibold leading-[0.98] tracking-[-0.035em] text-[#001A33] sm:text-6xl lg:text-7xl xl:text-[5.25rem]"
            >
              {t('title')}
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#263F50] sm:text-xl">
              {t('subtitle')}
            </p>
          </div>
          <div className="min-w-0">
            <PublicSituationActions />
            <PublicSupportPanel whatsappHref={contacts.whatsappHref} />
          </div>
          <div className="min-w-0 lg:col-span-2">
            <PublicMembershipAction />
          </div>
        </div>
      )}
    </section>
  );
}
