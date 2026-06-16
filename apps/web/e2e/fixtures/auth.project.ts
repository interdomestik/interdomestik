import { type TestInfo } from '@playwright/test';

export { credsFor } from './auth-users';

export type Tenant = 'ks' | 'mk' | 'pilot';
export type Role =
  | 'member'
  | 'member_empty'
  | 'admin'
  | 'agent'
  | 'staff'
  | 'branch_manager'
  | 'admin_mk';

export type ProjectUrlInfo = {
  baseURL: string;
  origin: string;
  locale: string;
};

export type GlobalE2E = typeof globalThis & {
  __E2E_BASE_URL?: string;
};

export function getProjectUrlInfo(
  testInfo: TestInfo,
  baseURLFromFixture?: string | null
): ProjectUrlInfo {
  const baseURL = (testInfo.project.use.baseURL ?? baseURLFromFixture)?.toString();
  if (!baseURL) {
    throw new Error(
      'Playwright baseURL is required for auth fixtures. Set project.use.baseURL in playwright.config.ts.'
    );
  }

  const url = new URL(baseURL);
  const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';
  const locale = /^(sq|mk|en)$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';

  return {
    baseURL,
    origin: url.origin,
    locale,
  };
}

export function setWorkerE2EBaseURL(info: ProjectUrlInfo): void {
  // Each Playwright worker runs a single project; stash baseURL so e2e/routes.ts
  // can derive the correct default locale per worker (no cross-project leakage).
  (globalThis as GlobalE2E).__E2E_BASE_URL = info.baseURL;
}

export function buildUiLoginUrl(info: ProjectUrlInfo): string {
  return `${info.origin}/${info.locale}/login`;
}

export function getTenantFromTestInfo(testInfo: TestInfo): Tenant {
  const tenantId = testInfo.project.use.extraHTTPHeaders?.['x-tenant-id'];
  if (tenantId === 'tenant_ks') return 'ks';
  if (tenantId === 'tenant_mk') return 'mk';

  const name = testInfo.project.name;
  if (name.includes('pilot')) return 'pilot';
  if (name.includes('mk')) return 'mk';
  return 'ks';
}

export function ipForRole(role: Role): string {
  // Stable IPs for each role to avoid unexpected rate limiting collision if checking by IP
  switch (role) {
    case 'member':
    case 'member_empty':
      return '10.0.0.11';
    case 'admin':
      return '10.0.0.12';
    case 'agent':
      return '10.0.0.13';
    case 'staff':
      return '10.0.0.14';
    case 'branch_manager':
      return '10.0.0.15';
    default:
      return '10.0.0.10';
  }
}

export function getApiOrigin(baseURL: string): string {
  return new URL(baseURL).origin;
}

/**
 * Resolves the trusted authentication origin.
 * Default to 127.0.0.1:3000 but allow override via E2E_AUTH_ORIGIN.
 */
export function getAuthOrigin(): string {
  return process.env.E2E_AUTH_ORIGIN || 'http://127.0.0.1:3000';
}

/**
 * Resolves the trusted authentication host (no protocol).
 */
export function getAuthHost(): string {
  return new URL(getAuthOrigin()).host;
}
