import type { HelpNowContentLocale } from './content-packs';
import type { HelpNowCopy } from './copy-types';
import { helpNowCopyEn } from './copy-en';
import { helpNowCopyMk } from './copy-mk';
import { helpNowCopySq } from './copy-sq';
import { helpNowCopySr } from './copy-sr';

export type { HelpNowCopy } from './copy-types';

const COPY: Readonly<Record<HelpNowContentLocale, HelpNowCopy>> = {
  en: helpNowCopyEn,
  sq: helpNowCopySq,
  mk: helpNowCopyMk,
  sr: helpNowCopySr,
};

export const getHelpNowCopy = (locale: HelpNowContentLocale): HelpNowCopy => COPY[locale];
