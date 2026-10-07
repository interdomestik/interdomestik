import type { HelpNowContentLocale } from './content-packs';
import type { HelpNowCopy } from './copy-types';
import helpNowCopyEn from './copy-en.json';
import helpNowCopyMk from './copy-mk.json';
import helpNowCopySq from './copy-sq.json';
import helpNowCopySr from './copy-sr.json';

export type { HelpNowCopy } from './copy-types';

// Locale copy is pure data: each JSON catalog is checked against HelpNowCopy at compile time.
const COPY = {
  en: helpNowCopyEn satisfies HelpNowCopy,
  sq: helpNowCopySq satisfies HelpNowCopy,
  mk: helpNowCopyMk satisfies HelpNowCopy,
  sr: helpNowCopySr satisfies HelpNowCopy,
} satisfies Readonly<Record<HelpNowContentLocale, HelpNowCopy>>;

export const getHelpNowCopy = (locale: HelpNowContentLocale): HelpNowCopy => COPY[locale];
