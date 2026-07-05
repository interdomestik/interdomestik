import { PUBLIC_FREE_START_ANCHOR_HREF } from '@/lib/public-membership-entry';

type HeroTranslator = (key: string) => string;

export function getHeroPrimaryLabel(primaryHref: string, t: HeroTranslator): string {
  if (primaryHref === '/help-now') return t('v2.helpNow');
  if (primaryHref.includes(PUBLIC_FREE_START_ANCHOR_HREF)) return t('callNow');
  return t('cta');
}
