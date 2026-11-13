import type { HelpNowCopy } from './copy';
import type { HelpNowCountry, HelpNowScenario } from './content-packs';

export function getSceneChecklist(
  copy: HelpNowCopy,
  scenario: HelpNowScenario,
  country: HelpNowCountry
): readonly string[] {
  const scenarios = {
    car: copy.checklist,
    injury: copy.injuryChecklist,
    property: copy.propertyChecklist,
    flight: [],
  };
  return [
    ...scenarios[scenario],
    copy.countryChecklist.replace('{country}', copy.countries[country]),
  ];
}
