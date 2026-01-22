import { type TestInfo } from '@playwright/test';

export type Locale = 'sq' | 'en' | 'mk' | 'sr' | 'de' | 'hr';
const SUPPORTED_LOCALES: Locale[] = ['sq', 'en', 'mk', 'sr', 'de', 'hr'];

type GlobalE2E = typeof globalThis & {
  __E2E_BASE_URL?: string;
};

/**
 * Canonical parser for locale from a baseURL string.
 */
function parseLocaleFromUrl(urlStr: string): Locale {
  try {
    const url = new URL(urlStr);
    const firstSegment = url.pathname.split('/').find(Boolean) as any;
    if (SUPPORTED_LOCALES.includes(firstSegment)) {
      return firstSegment;
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
export function getLocale(input: Locale | string | TestInfo): Locale {
  if (!input) {
    throw new Error('[getLocale] Contract Violation: Input is required.');
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
  home: (l: Locale | string | TestInfo) => withLocale('/', l),
  stats: (l: Locale | string | TestInfo) => withLocale('/stats', l),
  partners: (l: Locale | string | TestInfo) => withLocale('/partners', l),
  pricing: (l: Locale | string | TestInfo) => withLocale('/pricing', l),
  login: (l: Locale | string | TestInfo) => withLocale('/login', l),
  register: (l: Locale | string | TestInfo) => withLocale('/register', l),
  member: (l: Locale | string | TestInfo) => withLocale('/member', l),
  memberClaims: (l: Locale | string | TestInfo) => withLocale('/member/claims', l),
  memberNewClaim: (l: Locale | string | TestInfo) => withLocale('/member/claims/new', l),
  memberSettings: (l: Locale | string | TestInfo) => withLocale('/member/settings', l),
  memberMembership: (l: Locale | string | TestInfo) => withLocale('/member/membership', l),
  memberClaimDetail: (claimId: string, l: Locale | string | TestInfo) =>
    withLocale(`/member/claims/${encodeURIComponent(claimId)}`, l),
  staff: (l: Locale | string | TestInfo) => withLocale('/staff', l),
  admin: (l: Locale | string | TestInfo) => withLocale('/admin', l),
  adminBranches: (l: Locale | string | TestInfo) => withLocale('/admin/branches', l),
  adminLeads: (l: Locale | string | TestInfo) => withLocale('/admin/leads', l),
  agent: (l: Locale | string | TestInfo) => withLocale('/agent', l),
  agentLeads: (l: Locale | string | TestInfo) => withLocale('/agent/leads', l),
} as const;
