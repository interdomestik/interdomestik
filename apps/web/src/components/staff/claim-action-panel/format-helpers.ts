export type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

export const utcDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

export function formatUtcDateTime(value: string | null | undefined, t: TranslateFn) {
  if (!value) return t('staff_actions.common.pending');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t('staff_actions.common.pending');
  return `${utcDateTimeFormatter.format(parsed)} UTC`;
}
