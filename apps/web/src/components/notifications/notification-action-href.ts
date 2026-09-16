import { LOCALES } from '@/i18n/locales';

const LEGACY_MEMBER_CLAIM_NOTIFICATION_TYPES = new Set(['claim_submitted', 'claim_status_changed']);

export function normalizeNotificationActionHref(actionUrl: string, type?: string): string {
  if (!actionUrl.startsWith('/')) return actionUrl;

  const localeMatch = /^\/([^/?#]+)(?=\/|[?#]|$)/.exec(actionUrl);
  const localeFreeHref =
    localeMatch && LOCALES.includes(localeMatch[1] as (typeof LOCALES)[number])
      ? actionUrl.slice(localeMatch[0].length)
      : actionUrl;
  const normalizedHref = localeFreeHref.startsWith('/') ? localeFreeHref : `/${localeFreeHref}`;

  return type && LEGACY_MEMBER_CLAIM_NOTIFICATION_TYPES.has(type)
    ? normalizedHref.replace(/^\/dashboard\/claims\//, '/member/claims/')
    : normalizedHref;
}
