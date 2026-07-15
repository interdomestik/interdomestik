import { Plane } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PublicEntryInjuryAction } from './public-entry-injury-action';
import { PublicEntryPropertyAction } from './public-entry-property-action';
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
        <PublicEntryPropertyAction label={t('property')} />
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
