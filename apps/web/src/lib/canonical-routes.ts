import type { RoleLike } from './roles.core';

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'tenant_admin', 'branch_manager']);
const SUPPORTED_LOCALES = ['sq', 'en', 'sr', 'mk'] as const;

function normalizeLocale(locale: string): (typeof SUPPORTED_LOCALES)[number] | null {
  const trimmed = locale?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLowerCase();
  return SUPPORTED_LOCALES.includes(normalized as (typeof SUPPORTED_LOCALES)[number])
    ? (normalized as (typeof SUPPORTED_LOCALES)[number])
    : null;
}

export function getCanonicalRouteForRole(role: RoleLike, locale: string): string | null {
  if (!role) return null;
  const safeLocale = normalizeLocale(locale);
  if (!safeLocale) return null;
  if (ADMIN_ROLES.has(role)) return `/${safeLocale}/admin/overview`;
  if (role === 'staff') return `/${safeLocale}/staff/claims`;
  if (role === 'agent') return `/${safeLocale}/agent/members`;
  if (role === 'member' || role === 'user') return `/${safeLocale}/member`;
  return null;
}

export function getPortalLabel(role: RoleLike): string {
  if (ADMIN_ROLES.has(role ?? '')) return 'Admin';
  if (role === 'staff') return 'Staff';
  if (role === 'agent') return 'Agent';
  return 'Member';
}

export function stripLocalePrefixFromCanonicalRoute(
  canonical: string | null,
  locale: string
): string | null {
  if (!canonical) return null;
  const safeLocale = normalizeLocale(locale);
  if (!safeLocale) return canonical;
  const prefix = `/${safeLocale}/`;
  return canonical.startsWith(prefix) ? canonical.replace(`/${safeLocale}`, '') : canonical;
}
