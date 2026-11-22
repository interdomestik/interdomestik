import { claimMailLabels } from './catalogues/labels';
import { claimMailMessages } from './catalogues/messages';
import type { ClaimMailCopy, ClaimMailLocale } from './types';

function claimMailCopy(locale: ClaimMailLocale): ClaimMailCopy {
  return { ...claimMailLabels(locale), messages: claimMailMessages(locale) };
}

export const CLAIM_MAIL_COPY: Record<ClaimMailLocale, ClaimMailCopy> = {
  sq: claimMailCopy('sq'),
  en: claimMailCopy('en'),
  sr: claimMailCopy('sr'),
  mk: claimMailCopy('mk'),
  de: claimMailCopy('de'),
};
