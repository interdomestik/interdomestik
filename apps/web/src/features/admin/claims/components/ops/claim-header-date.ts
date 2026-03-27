import { format } from 'date-fns';
import { enUS, mk, sq, sr } from 'date-fns/locale';

function toDateFnsLocale(locale: string) {
  switch (locale) {
    case 'mk':
      return mk;
    case 'sq':
      return sq;
    case 'sr':
      return sr;
    default:
      return enUS;
  }
}

export function formatClaimCreatedDate(value: Date | string | null, locale: string): string {
  if (!value) return '';

  return format(new Date(value), 'MMMM d, yyyy', {
    locale: toDateFnsLocale(locale),
  });
}
