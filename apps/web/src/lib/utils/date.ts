/** Shared presentation zone for the KS/MK pilot; never use the host's local zone. */
export const PILOT_TIME_ZONE = 'Europe/Skopje';

type DateValue = Date | string | null | undefined;

export function resolveDateLocale(locale: string): string {
  const locales: Record<string, string> = {
    en: 'en-US',
    sq: 'sq-AL',
    de: 'de-DE',
    sr: 'sr-Latn-RS',
    mk: 'mk-MK',
  };
  return locales[locale] ?? locale;
}

function parseDate(value: DateValue): Date | null {
  if (!value) return null;
  // A timestamp without an offset must not acquire the server/browser host zone.
  const normalized =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? `${value}Z`
      : value;
  const date = normalized instanceof Date ? normalized : new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: PILOT_TIME_ZONE,
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map(part => [part.type, part.value])
  );
}

export function formatPilotDate(value: DateValue, locale: string, fallback: string): string {
  const date = parseDate(value);
  if (!date) return fallback;
  const { day, month, year } = dateParts(date);
  return locale === 'en' ? `${month}/${day}/${year}` : `${day}.${month}.${year}`;
}

export function formatPilotDateTime(value: DateValue, locale: string, fallback: string): string {
  const date = parseDate(value);
  if (!date) return fallback;
  const { hour, minute } = dateParts(date);
  return `${formatPilotDate(date, locale, fallback)} ${hour}:${minute}`;
}

/**
 * Long date with weekday ("e premte, 13 nëntor 2026") for server-rendered pages, where the runtime
 * has full ICU data; sr resolves to Latin script.
 */
export function formatPilotLongDate(value: Date, locale: string): string {
  return value.toLocaleDateString(resolveDateLocale(locale), {
    timeZone: PILOT_TIME_ZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** 24-hour "HH:mm" in the pilot zone. */
export function formatPilotTime(value: DateValue, fallback: string): string {
  const date = parseDate(value);
  if (!date) return fallback;
  const { hour, minute } = dateParts(date);
  return `${hour}:${minute}`;
}

/** Calendar day "yyyy-MM-dd" in the pilot zone, for grouping items by the day users see. */
export function pilotDateKey(value: DateValue): string {
  const date = parseDate(value);
  if (!date) return '';
  const { day, month, year } = dateParts(date);
  return `${year}-${month}-${day}`;
}

export function formatDate(value: DateValue, fallback: string): string {
  return formatPilotDate(value, 'en', fallback);
}
