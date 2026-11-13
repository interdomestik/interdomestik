import type { HelpNowContentLocale } from './content-packs';
import type { HelpNowCopy } from './copy-types';
import helpNowCopyDe from './copy-de.json';
import helpNowCopyEn from './copy-en.json';
import helpNowCopyMk from './copy-mk.json';
import helpNowCopySq from './copy-sq.json';
import helpNowCopySr from './copy-sr.json';

import injuryEn from '@/messages/en/injuryJourney.json';
import propertyEn from '@/messages/en/propertyJourney.json';
import injurySq from '@/messages/sq/injuryJourney.json';
import propertySq from '@/messages/sq/propertyJourney.json';
import injurySr from '@/messages/sr/injuryJourney.json';
import propertySr from '@/messages/sr/propertyJourney.json';
import injuryMk from '@/messages/mk/injuryJourney.json';
import propertyMk from '@/messages/mk/propertyJourney.json';
import injuryDe from '@/messages/de/injuryJourney.json';
import propertyDe from '@/messages/de/propertyJourney.json';

export type { HelpNowCopy } from './copy-types';

type BaseCopy = Omit<
  HelpNowCopy,
  'injuryChecklist' | 'propertyChecklist' | 'injuryPrompt' | 'propertyPrompt'
>;

// Locale copy is pure data: each JSON catalog is checked against HelpNowCopy at compile time.
const COPY = {
  en: helpNowCopyEn satisfies BaseCopy,
  sq: helpNowCopySq satisfies BaseCopy,
  mk: helpNowCopyMk satisfies BaseCopy,
  sr: helpNowCopySr satisfies BaseCopy,
  de: helpNowCopyDe satisfies BaseCopy,
} satisfies Readonly<Record<HelpNowContentLocale, BaseCopy>>;

const injury = { en: injuryEn, sq: injurySq, sr: injurySr, mk: injuryMk, de: injuryDe };
const property = { en: propertyEn, sq: propertySq, sr: propertySr, mk: propertyMk, de: propertyDe };

export function getHelpNowCopy(locale: HelpNowContentLocale): HelpNowCopy {
  return {
    ...COPY[locale],
    injuryPrompt: injury[locale].injuryJourney.evidence.body,
    propertyPrompt: property[locale].propertyJourney.evidence.body,
    injuryChecklist: Object.values(injury[locale].injuryJourney.evidence.items),
    propertyChecklist: Object.values(property[locale].propertyJourney.evidence.items),
  };
}
