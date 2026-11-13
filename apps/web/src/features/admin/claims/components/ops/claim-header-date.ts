import { format, type Locale } from 'date-fns';
import { de, enUS, mk, sq, srLatn } from 'date-fns/locale';

import { pilotDateKey } from '@/lib/utils/date';

// Serbian copy is Latin script; day-first order everywhere except English.
const DATE_FNS_FORMATS: Readonly<Record<string, readonly [Locale, string]>> = {
  de: [de, 'd. MMMM yyyy'],
  mk: [mk, 'd MMMM yyyy'],
  sq: [sq, 'd MMMM yyyy'],
  sr: [srLatn, 'd. MMMM yyyy.'],
};

/** Long claim creation date for the pilot-zone calendar day, independent of the host zone. */
export function formatClaimCreatedDate(value: Date | string | null, locale: string): string {
  const dayKey = pilotDateKey(value);
  if (!dayKey) return '';
  const [dateLocale, pattern] = Object.hasOwn(DATE_FNS_FORMATS, locale)
    ? DATE_FNS_FORMATS[locale]
    : [enUS, 'MMMM d, yyyy'];
  // Noon UTC of the pilot day stays on the same calendar day in every host zone.
  return format(new Date(`${dayKey}T12:00:00.000Z`), pattern, { locale: dateLocale });
}
