/**
 * Date formatting utilities used across components
 */

export function resolveDateLocale(locale: string): string {
  switch (locale) {
    case 'mk':
      return 'mk-MK';
    case 'sq':
      return 'sq-AL';
    case 'sr':
      return 'sr-RS';
    default:
      return locale;
  }
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatPilotDate(
  value: Date | string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  if (locale === 'mk' || locale === 'sq' || locale === 'sr') {
    return `${padDatePart(date.getDate())}.${padDatePart(date.getMonth() + 1)}.${date.getFullYear()}`;
  }

  return new Intl.DateTimeFormat(resolveDateLocale(locale), {
    dateStyle: 'medium',
  }).format(date);
}

export function formatPilotDateTime(
  value: Date | string | null | undefined,
  locale: string,
  fallback: string
): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  if (locale === 'mk' || locale === 'sq' || locale === 'sr') {
    return `${formatPilotDate(date, locale, fallback)} ${padDatePart(date.getHours())}:${padDatePart(
      date.getMinutes()
    )}`;
  }

  return new Intl.DateTimeFormat(resolveDateLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDate(value: Date | string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
}
