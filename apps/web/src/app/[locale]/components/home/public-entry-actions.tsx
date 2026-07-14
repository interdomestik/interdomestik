import { Link } from '@/i18n/routing';
import {
  PUBLIC_FREE_START_ANCHOR_HREF,
  PUBLIC_MEMBERSHIP_ENTRY_HREF,
} from '@/lib/public-membership-entry';
import {
  ArrowRight,
  Globe2,
  HeartPulse,
  House,
  MessageCircle,
  Plane,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PublicEntryVehicleAction } from './public-entry-vehicle-action';

const situations = [
  { icon: HeartPulse, label: 'injury' },
  { icon: House, label: 'property' },
] as const;

type PublicEntryActionsProps = Readonly<{ whatsappHref?: string }>;

export function PublicSituationActions() {
  const t = useTranslations('hero.publicEntry');

  return (
    <ul data-testid="public-entry-situations" className="border-t border-[#B8C7C7]">
      <li className="border-b border-[#B8C7C7]">
        <PublicEntryVehicleAction label={t('vehicle')} />
      </li>
      {situations.map(({ icon: Icon, label }) => (
        <li key={label} className="border-b border-[#B8C7C7]">
          <Link
            data-testid={`public-entry-${label}`}
            href={PUBLIC_FREE_START_ANCHOR_HREF}
            className="group grid min-h-[5.25rem] grid-cols-[3rem_minmax(0,1fr)_1.5rem] items-center gap-3 py-3 text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70] sm:grid-cols-[4rem_minmax(0,1fr)_1.5rem] sm:gap-5"
          >
            <Icon
              aria-hidden="true"
              className="h-8 w-8 text-[#006A70] sm:h-10 sm:w-10"
              strokeWidth={1.5}
            />
            <span className="text-base font-semibold leading-6 sm:text-lg">{t(label)}</span>
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 text-[#006A70] transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
            />
          </Link>
        </li>
      ))}
      <li
        data-testid="public-entry-flight"
        className="grid min-h-[5.25rem] grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#B8C7C7] py-3 text-[#001A33] sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:gap-5"
      >
        <Plane
          aria-hidden="true"
          className="h-8 w-8 text-[#006A70] sm:h-10 sm:w-10"
          strokeWidth={1.5}
        />
        <span className="text-base font-semibold leading-6 sm:text-lg">{t('flight')}</span>
        <span className="text-sm font-bold text-[#8A5500]">{t('soon')}</span>
      </li>
    </ul>
  );
}

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
