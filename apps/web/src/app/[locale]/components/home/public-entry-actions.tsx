import { Link } from '@/i18n/routing';
import { PUBLIC_MEMBERSHIP_ENTRY_HREF } from '@/lib/public-membership-entry';
import { ArrowRight, Globe2, MessageCircle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PublicSituationActions } from './public-situation-actions';

export { PublicSituationActions } from './public-situation-actions';

type PublicEntryActionsProps = Readonly<{ whatsappHref?: string }>;

export function PublicSupportPanel({ whatsappHref }: PublicEntryActionsProps) {
  const t = useTranslations('hero.publicEntry');

  return (
    <div className="space-y-4 pt-6 text-[#001A33]">
      {whatsappHref ? (
        <>
          <a
            href={whatsappHref}
            className="group flex min-h-11 items-start gap-3 text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
          >
            <MessageCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <strong>{t('whatsappLink')}</strong>
              <small className="mt-1 block text-sm text-[#334D5C] no-underline">
                {t('availability')}
              </small>
            </span>
          </a>
          <a
            href={whatsappHref}
            className="group flex min-h-11 items-start gap-3 text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
          >
            <Globe2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              <small className="block text-xs font-bold uppercase tracking-[0.14em] text-[#334D5C] no-underline">
                {t('diasporaEyebrow')}
              </small>
              <strong className="mt-1 block">{t('diasporaLink')}</strong>
            </span>
          </a>
        </>
      ) : null}
      <p className="flex gap-3 text-sm leading-6 text-[#334D5C]">
        <ShieldAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#8A5500]" />
        {t('emergency')}
      </p>
      <div className="flex gap-3 border-t border-[#B8C7C7] pt-4">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#006A70]" />
        <p>
          <strong className="block text-base">{t('privacyTitle')}</strong>
          <span className="mt-1 block text-sm leading-6 text-[#334D5C]">{t('privacyBody')}</span>
        </p>
      </div>
    </div>
  );
}

export function PublicMembershipAction() {
  const t = useTranslations('hero.publicEntry');
  return (
    <div className="grid gap-5 border-t border-[#B8C7C7] pt-7 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto] lg:items-center">
      <p className="font-serif text-2xl font-semibold text-[#001A33] sm:text-3xl">
        {t('membershipPrompt')}
      </p>
      <p className="max-w-2xl text-sm leading-6 text-[#334D5C] sm:text-base">
        {t('membershipBody')}
      </p>
      <Link
        data-testid="public-entry-membership"
        href={PUBLIC_MEMBERSHIP_ENTRY_HREF}
        className="inline-flex min-h-12 items-center justify-between gap-4 border border-[#006A70] px-5 py-3 font-semibold text-[#005F64] transition-colors hover:bg-[#006A70] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2 motion-reduce:transition-none"
      >
        {t('membershipLabel')}
        <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
      </Link>
    </div>
  );
}

export function PublicEntryActions({ whatsappHref }: PublicEntryActionsProps) {
  return (
    <>
      <PublicSituationActions />
      <PublicSupportPanel whatsappHref={whatsappHref} />
      <PublicMembershipAction />
    </>
  );
}
