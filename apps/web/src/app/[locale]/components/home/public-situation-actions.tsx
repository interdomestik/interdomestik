import { Link } from '@/i18n/routing';
import { PUBLIC_FREE_START_ANCHOR_HREF } from '@/lib/public-membership-entry';
import { ArrowRight, House, Plane } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PublicEntryInjuryAction } from './public-entry-injury-action';
import { PublicEntryVehicleAction } from './public-entry-vehicle-action';

export function PublicSituationActions() {
  const t = useTranslations('hero.publicEntry');

  return (
    <ul data-testid="public-entry-situations" className="border-t border-[#B8C7C7]">
      <li className="border-b border-[#B8C7C7]">
        <PublicEntryVehicleAction label={t('vehicle')} />
      </li>
      <li className="border-b border-[#B8C7C7]">
        <PublicEntryInjuryAction label={t('injury')} />
      </li>
      <li className="border-b border-[#B8C7C7]">
        <Link
          data-testid="public-entry-property"
          href={PUBLIC_FREE_START_ANCHOR_HREF}
          className="group grid min-h-[5.25rem] grid-cols-[3rem_minmax(0,1fr)_1.5rem] items-center gap-3 py-3 text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70] sm:grid-cols-[4rem_minmax(0,1fr)_1.5rem] sm:gap-5"
        >
          <House
            aria-hidden="true"
            className="h-8 w-8 text-[#006A70] sm:h-10 sm:w-10"
            strokeWidth={1.5}
          />
          <span className="text-base font-semibold leading-6 sm:text-lg">{t('property')}</span>
          <ArrowRight
            aria-hidden="true"
            className="h-5 w-5 text-[#006A70] transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
          />
        </Link>
      </li>
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
