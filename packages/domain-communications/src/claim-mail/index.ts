import { DE_COPY } from './copy-de';
import { EN_COPY } from './copy-en';
import { MK_COPY } from './copy-mk';
import { SQ_COPY } from './copy-sq';
import { SR_COPY } from './copy-sr';
import type { ClaimMailCopy, ClaimMailLocale } from './types';

export const CLAIM_MAIL_COPY: Record<ClaimMailLocale, ClaimMailCopy> = {
  sq: SQ_COPY,
  en: EN_COPY,
  sr: SR_COPY,
  mk: MK_COPY,
  de: DE_COPY,
};
