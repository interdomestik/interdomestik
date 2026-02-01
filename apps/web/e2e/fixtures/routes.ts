import type { TestInfo } from '@playwright/test';

function requireBaseURL(testInfo: TestInfo): string {
  const baseURL = testInfo.project.use.baseURL?.toString();
  if (!baseURL) {
    throw new Error('Expected project.use.baseURL to be set for this Playwright project.');
  }
  return baseURL;
}

export function getLocale(testInfo: TestInfo): string {
  const baseURL = requireBaseURL(testInfo);
  const url = new URL(baseURL);
  const firstSegment = url.pathname.split('/').find(Boolean) ?? 'en';

  // Locale is language-only. Do not map locale -> tenant.
  return /^[a-z]{2}$/i.test(firstSegment) ? firstSegment.toLowerCase() : 'en';
}

export function getRootURL(testInfo: TestInfo): string {
  const baseURL = requireBaseURL(testInfo);
  return new URL(baseURL).origin;
}

export function path(testInfo: TestInfo, pathname: string): string {
  const origin = getRootURL(testInfo);
  const locale = getLocale(testInfo);

  const pathOnly = pathname.startsWith('/') ? pathname : `/${pathname}`;

  // If caller already included a locale prefix, keep it.
  if (pathOnly.startsWith(`/${locale}/`) || pathOnly === `/${locale}`) {
    return new URL(pathOnly, origin).toString();
  }

  // If caller included some other locale, keep it as-is (contract tests sometimes do this).
  if (/^\/[a-z]{2}(\/|$)/i.test(pathOnly)) {
    return new URL(pathOnly, origin).toString();
  }

  return new URL(`/${locale}${pathOnly}`, origin).toString();
}

export function rootURL(testInfo: TestInfo, pathname: string): string {
  const origin = getRootURL(testInfo);
  const pathOnly = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(pathOnly, origin).toString();
}
