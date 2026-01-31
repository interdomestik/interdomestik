import { type TestInfo } from '@playwright/test';

export type Locale = 'sq' | 'en' | 'mk' | 'sr' | 'de' | 'hr';
const SUPPORTED_LOCALES: Locale[] = ['sq', 'en', 'mk', 'sr', 'de', 'hr'];

/**
 * Canonical parser for locale from a baseURL string.
 */
function parseLocaleFromUrl(urlStr: string): Locale {
  try {
    const url = new URL(urlStr);
    const firstSegment = url.pathname.split('/').find(Boolean);
    if (firstSegment && SUPPORTED_LOCALES.includes(firstSegment as Locale)) {
      return firstSegment as Locale;
    }
  } catch {
    // ignore
  }
  return 'en';
}

/**
 * Single source of truth for locale derivation.
 * Strictly Rule #7: Fail fast on invalid types.
 * Strictly Rule #1: Deterministic derivation from project baseURL.
 */
export function getLocale(input?: Locale | string | TestInfo): Locale {
  // Backward compatibility: If no locale provided, default to 'en'
  if (!input) {
    return 'en';
  }

  // Case 1: TestInfo object (Preferred for E2E specs)
  if (typeof input === 'object' && 'project' in input) {
    const baseURL = input.project.use.baseURL;
    if (!baseURL) {
      throw new Error('[getLocale] Contract Violation: TestInfo project.use.baseURL is missing.');
    }
    return parseLocaleFromUrl(baseURL);
  }

  // Case 2: Raw string (Supported for specific manual overrides)
  if (typeof input === 'string') {
    const normalized = input.replace(/^\//, '').trim().toLowerCase() as Locale;
    if (SUPPORTED_LOCALES.includes(normalized)) {
      return normalized;
    }
    throw new Error(
      `[getLocale] Invalid locale string: "${input}". Supported: ${SUPPORTED_LOCALES.join(', ')}`
    );
  }

  throw new Error(
    `[getLocale] Contract Violation: Expected string or TestInfo, received ${typeof input}`
  );
}

function withLocale(pathname: string, localeInput: Locale | string | TestInfo): string {
  const loc = getLocale(localeInput);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // If path already starts with a locale segment, return as-is
  const localePattern = new RegExp(`^\/(${SUPPORTED_LOCALES.join('|')})(\/|$)`, 'i');
  if (localePattern.test(path)) return path;

  return `/${loc}${path === '/' ? '' : path}`;
}

export const routes = {
  getLocale,
  home: (l?: Locale | string | TestInfo) => withLocale('/', l || 'en'),
  stats: (l?: Locale | string | TestInfo) => withLocale('/stats', l || 'en'),
  partners: (l?: Locale | string | TestInfo) => withLocale('/partners', l || 'en'),
  pricing: (l?: Locale | string | TestInfo) => withLocale('/pricing', l || 'en'),
  login: (l?: Locale | string | TestInfo) => withLocale('/login', l || 'en'),
  register: (l?: Locale | string | TestInfo) => withLocale('/register', l || 'en'),
  member: (l?: Locale | string | TestInfo) => withLocale('/member', l || 'en'),
  memberClaims: (l?: Locale | string | TestInfo) => withLocale('/member/claims', l || 'en'),
  memberNewClaim: (l?: Locale | string | TestInfo) => withLocale('/member/claims/new', l || 'en'),
  memberSettings: (l?: Locale | string | TestInfo) => withLocale('/member/settings', l || 'en'),
  memberMembership: (l?: Locale | string | TestInfo) => withLocale('/member/membership', l || 'en'),
  memberDiaspora: (l?: Locale | string | TestInfo) => withLocale('/member/diaspora', l || 'en'),
  memberClaimDetail: (claimId: string, l?: Locale | string | TestInfo) =>
    withLocale(`/member/claims/${encodeURIComponent(claimId)}`, l || 'en'),
  staff: (l?: Locale | string | TestInfo) => withLocale('/staff', l || 'en'),
  staffClaims: (l?: Locale | string | TestInfo) => withLocale('/staff/claims', l || 'en'),
  staffClaimDetail: (claimId: string, l?: Locale | string | TestInfo) =>
    withLocale(`/staff/claims/${encodeURIComponent(claimId)}`, l || 'en'),
  admin: (l?: Locale | string | TestInfo) => withLocale('/admin', l || 'en'),
  adminClaims: (l?: Locale | string | TestInfo) => withLocale('/admin/claims', l || 'en'),
  adminUsers: (l?: Locale | string | TestInfo) => withLocale('/admin/users', l || 'en'),
  adminAnalytics: (l?: Locale | string | TestInfo) => withLocale('/admin/analytics', l || 'en'),
  adminSettings: (l?: Locale | string | TestInfo) => withLocale('/admin/settings', l || 'en'),
  adminBranches: (l?: Locale | string | TestInfo) => withLocale('/admin/branches', l || 'en'),
  adminBranchDetail: (branchId: string, l?: Locale | string | TestInfo) =>
    withLocale(`/admin/branches/${encodeURIComponent(branchId)}`, l || 'en'),
  adminLeads: (l?: Locale | string | TestInfo) => withLocale('/admin/leads', l || 'en'),
  agent: (l?: Locale | string | TestInfo) => withLocale('/agent', l || 'en'),
  agentLeads: (l?: Locale | string | TestInfo) => withLocale('/agent/leads', l || 'en'),
  agentCrm: (l?: Locale | string | TestInfo) => withLocale('/agent/crm', l || 'en'),
  agentClients: (l?: Locale | string | TestInfo) => withLocale('/agent/clients', l || 'en'),
  agentCommissions: (l?: Locale | string | TestInfo) => withLocale('/agent/commissions', l || 'en'),
  agentWorkspace: (l?: Locale | string | TestInfo) => withLocale('/agent/workspace', l || 'en'),
  agentWorkspaceLeads: (l?: Locale | string | TestInfo) =>
    withLocale('/agent/workspace/leads', l || 'en'),
  agentWorkspaceClaims: (l?: Locale | string | TestInfo) =>
    withLocale('/agent/workspace/claims', l || 'en'),
} as const;
