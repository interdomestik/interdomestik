type GlobalE2E = typeof globalThis & {
  __E2E_BASE_URL?: string;
};

function defaultLocaleFromBaseURL(baseURL: string): string {
  try {
    const url = new URL(baseURL);
    const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';
    return /^(sq|mk|en)$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';
  } catch {
    return 'en';
  }
}

function getDefaultLocale(): string {
  const globalBaseURL = (globalThis as GlobalE2E).__E2E_BASE_URL;
  if (globalBaseURL) return defaultLocaleFromBaseURL(globalBaseURL);

  const envBaseURL = process.env.PLAYWRIGHT_BASE_URL;
  if (envBaseURL) return defaultLocaleFromBaseURL(envBaseURL);

  const envLocale = process.env.PLAYWRIGHT_LOCALE;
  if (envLocale) return envLocale.toLowerCase();

  return 'en';
}

function normalizeLocale(locale?: string): string {
  const value = (locale ?? getDefaultLocale()).trim();
  return value.startsWith('/') ? value.slice(1) : value;
}

function withLocale(pathname: string, locale?: string): string {
  const loc = normalizeLocale(locale);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // If caller already included a locale prefix, keep it.
  if (/^\/[a-z]{2}(\/|$)/i.test(path)) return path;
  return `/${loc}${path === '/' ? '' : path}`;
}

export const routes = {
  locale: normalizeLocale,

  home: (locale?: string) => withLocale('/', locale),
  stats: (locale?: string) => withLocale('/stats', locale),
  partners: (locale?: string) => withLocale('/partners', locale),
  pricing: (locale?: string) => withLocale('/pricing', locale),

  login: (locale?: string) => withLocale('/login', locale),
  loginRaw: () => '/login',
  register: (locale?: string) => withLocale('/register', locale),

  member: (locale?: string) => withLocale('/member', locale),
  memberClaims: (locale?: string) => withLocale('/member/claims', locale),
  memberNewClaim: (locale?: string) => withLocale('/member/claims/new', locale),
  memberSettings: (locale?: string) => withLocale('/member/settings', locale),
  memberClaimDetail: (claimId: string, locale?: string) =>
    withLocale(`/member/claims/${encodeURIComponent(claimId)}`, locale),

  staff: (locale?: string) => withLocale('/staff', locale),
  staffClaims: (locale?: string) => withLocale('/staff/claims', locale),
  staffClaimDetail: (claimId: string, locale?: string) =>
    withLocale(`/staff/claims/${encodeURIComponent(claimId)}`, locale),

  agent: (locale?: string) => withLocale('/agent', locale),
  agentCrm: (locale?: string) => withLocale('/agent/crm', locale),
  agentLeads: (locale?: string) => withLocale('/agent/leads', locale),
  agentClients: (locale?: string) => withLocale('/agent/clients', locale),
  agentCommissions: (locale?: string) => withLocale('/agent/commissions', locale),

  admin: (locale?: string) => withLocale('/admin', locale),
  adminClaims: (locale?: string) => withLocale('/admin/claims', locale),
  adminUsers: (locale?: string) => withLocale('/admin/users', locale),
  adminAnalytics: (locale?: string) => withLocale('/admin/analytics', locale),
  adminSettings: (locale?: string) => withLocale('/admin/settings', locale),
  adminBranches: (locale?: string) => withLocale('/admin/branches', locale),
} as const;
