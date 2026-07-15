import { useTranslations } from 'next-intl';
import { PublicEntryFlightAction } from './public-entry-flight-action';
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
      <li className="border-b border-[#B8C7C7]">
        <PublicEntryFlightAction label={t('flight')} />
      </li>
    </ul>
  );
}
