import { type TestInfo } from '@playwright/test';

export type Locale = 'sq' | 'en' | 'mk' | 'sr' | 'de' | 'hr';

type RouteLocaleInput = Locale | (string & {}) | TestInfo;
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
export function getLocale(input?: RouteLocaleInput): Locale {
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

function withLocale(pathname: string, localeInput: RouteLocaleInput): string {
  const loc = getLocale(localeInput);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // If path already starts with a locale segment, return as-is
  const localePattern = new RegExp(`^\/(${SUPPORTED_LOCALES.join('|')})(\/|$)`, 'i');
  if (localePattern.test(path)) return path;

  return `/${loc}${path === '/' ? '' : path}`;
}

export const routes = {
  getLocale,
  home: (l?: RouteLocaleInput) => withLocale('/', l || 'en'),
  stats: (l?: RouteLocaleInput) => withLocale('/stats', l || 'en'),
  partners: (l?: RouteLocaleInput) => withLocale('/partners', l || 'en'),
  pricing: (l?: RouteLocaleInput) => withLocale('/pricing', l || 'en'),
  helpNow: (l?: RouteLocaleInput) => withLocale('/help-now', l || 'en'),
  businessMembership: (l?: RouteLocaleInput) =>
    withLocale('/business-membership', l || 'en'),
  publicMembershipEntry: (l?: RouteLocaleInput) => withLocale('/pricing', l || 'en'),
  login: (l?: RouteLocaleInput) => withLocale('/login', l || 'en'),
  forgotPassword: (l?: RouteLocaleInput) => withLocale('/forgot-password', l || 'en'),
  register: (l?: RouteLocaleInput) => withLocale('/register', l || 'en'),
  resetPassword: (l?: RouteLocaleInput) => withLocale('/reset-password', l || 'en'),
  member: (l?: RouteLocaleInput) => withLocale('/member', l || 'en'),
  memberClaims: (l?: RouteLocaleInput) => withLocale('/member/claims', l || 'en'),
  memberHelp: (l?: RouteLocaleInput) => withLocale('/member/help', l || 'en'),
  memberNewClaim: (l?: RouteLocaleInput) => withLocale('/member/claims/new', l || 'en'),
  memberSettings: (l?: RouteLocaleInput) => withLocale('/member/settings', l || 'en'),
  memberMembership: (l?: RouteLocaleInput) => withLocale('/member/membership', l || 'en'),
  memberDiaspora: (l?: RouteLocaleInput) => withLocale('/member/diaspora', l || 'en'),
  memberClaimDetail: (claimId: string, l?: RouteLocaleInput) =>
    withLocale(`/member/claims/${encodeURIComponent(claimId)}`, l || 'en'),
  staff: (l?: RouteLocaleInput) => withLocale('/staff/claims', l || 'en'),
  staffClaims: (l?: RouteLocaleInput) => withLocale('/staff/claims', l || 'en'),
  staffSupportHandoffs: (l?: RouteLocaleInput) =>
    withLocale('/staff/support-handoffs', l || 'en'),
  staffClaimDetail: (claimId: string, l?: RouteLocaleInput) =>
    withLocale(`/staff/claims/${encodeURIComponent(claimId)}`, l || 'en'),
  admin: (l?: RouteLocaleInput) => withLocale('/admin/overview', l || 'en'),
  adminClaims: (l?: RouteLocaleInput) => withLocale('/admin/claims', l || 'en'),
  adminUsers: (l?: RouteLocaleInput) => withLocale('/admin/users', l || 'en'),
  adminAnalytics: (l?: RouteLocaleInput) => withLocale('/admin/analytics', l || 'en'),
  adminSettings: (l?: RouteLocaleInput) => withLocale('/admin/settings', l || 'en'),
  adminBranches: (l?: RouteLocaleInput) => withLocale('/admin/branches', l || 'en'),
  adminBranchDetail: (branchId: string, l?: RouteLocaleInput) =>
    withLocale(`/admin/branches/${encodeURIComponent(branchId)}`, l || 'en'),
  adminLeads: (l?: RouteLocaleInput) => withLocale('/admin/leads', l || 'en'),
  agent: (l?: RouteLocaleInput) => withLocale('/agent/members', l || 'en'),
  agentMembers: (l?: RouteLocaleInput) => withLocale('/agent/members', l || 'en'),
  agentImport: (l?: RouteLocaleInput) => withLocale('/agent/import', l || 'en'),
  agentMemberDetail: (memberId: string, l?: RouteLocaleInput) =>
    withLocale(`/agent/members/${encodeURIComponent(memberId)}`, l || 'en'),
  agentLeads: (l?: RouteLocaleInput) => withLocale('/agent/leads', l || 'en'),
  agentCrm: (l?: RouteLocaleInput) => withLocale('/agent/crm', l || 'en'),
  agentClients: (l?: RouteLocaleInput) => withLocale('/agent/clients', l || 'en'),
  agentCommissions: (l?: RouteLocaleInput) => withLocale('/agent/commissions', l || 'en'),
  agentWorkspace: (l?: RouteLocaleInput) => withLocale('/agent/workspace', l || 'en'),
  agentWorkspaceLeads: (l?: RouteLocaleInput) =>
    withLocale('/agent/workspace/leads', l || 'en'),
  agentWorkspaceClaims: (l?: RouteLocaleInput) =>
    withLocale('/agent/workspace/claims', l || 'en'),
} as const;
