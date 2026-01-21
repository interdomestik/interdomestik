export type Locale = string;

const DEFAULT_LOCALE: Locale = process.env.PLAYWRIGHT_LOCALE ?? 'en';

function normalizeLocale(locale?: Locale): string {
  const value = (locale ?? DEFAULT_LOCALE).trim();
  return value.startsWith('/') ? value.slice(1) : value;
}

function withLocale(pathname: string, locale?: Locale): string {
  const loc = normalizeLocale(locale);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // If caller already included a locale prefix, keep it.
  if (/^\/[a-z]{2}(\/|$)/i.test(path)) return path;
  return `/${loc}${path === '/' ? '' : path}`;
}

export const routes = {
  locale: normalizeLocale,

  home: (locale?: Locale) => withLocale('/', locale),
  stats: (locale?: Locale) => withLocale('/stats', locale),
  partners: (locale?: Locale) => withLocale('/partners', locale),
  pricing: (locale?: Locale) => withLocale('/pricing', locale),

  login: (locale?: Locale) => withLocale('/login', locale),
  loginRaw: () => '/login',
  register: (locale?: Locale) => withLocale('/register', locale),

  member: (locale?: Locale) => withLocale('/member', locale),
  memberClaims: (locale?: Locale) => withLocale('/member/claims', locale),
  memberNewClaim: (locale?: Locale) => withLocale('/member/claims/new', locale),
  memberSettings: (locale?: Locale) => withLocale('/member/settings', locale),
  memberClaimDetail: (claimId: string, locale?: Locale) =>
    withLocale(`/member/claims/${encodeURIComponent(claimId)}`, locale),

  staff: (locale?: Locale) => withLocale('/staff', locale),
  staffClaims: (locale?: Locale) => withLocale('/staff/claims', locale),
  staffClaimDetail: (claimId: string, locale?: Locale) =>
    withLocale(`/staff/claims/${encodeURIComponent(claimId)}`, locale),

  agent: (locale?: Locale) => withLocale('/agent', locale),
  agentCrm: (locale?: Locale) => withLocale('/agent/crm', locale),
  agentLeads: (locale?: Locale) => withLocale('/agent/leads', locale),
  agentClients: (locale?: Locale) => withLocale('/agent/clients', locale),
  agentCommissions: (locale?: Locale) => withLocale('/agent/commissions', locale),

  admin: (locale?: Locale) => withLocale('/admin', locale),
  adminClaims: (locale?: Locale) => withLocale('/admin/claims', locale),
  adminLeads: (locale?: Locale) => withLocale('/admin/leads', locale),
  adminUsers: (locale?: Locale) => withLocale('/admin/users', locale),
  adminAnalytics: (locale?: Locale) => withLocale('/admin/analytics', locale),
  adminSettings: (locale?: Locale) => withLocale('/admin/settings', locale),
  adminBranches: (locale?: Locale) => withLocale('/admin/branches', locale),
} as const;
