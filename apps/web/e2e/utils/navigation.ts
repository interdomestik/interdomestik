import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Re-export getLocale for convenience
 */
export { getLocale } from '../routes';

// Supported locales for detecting locale-prefixed paths
const SUPPORTED_LOCALES = ['sq', 'en', 'mk', 'sr', 'de', 'hr'];

/**
 * Check if a path starts with a supported locale segment.
 */
function pathHasLocalePrefix(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const firstSegment = normalized.split('/')[1];
  return SUPPORTED_LOCALES.includes(firstSegment);
}

/**
 * Navigates to a path using project-derived baseURL and waits for a marker.
 * Strictly enforces Rule #2: No ad-hoc URL building.
 *
 * If path already includes a locale prefix (e.g., /sq/pricing from routes helpers),
 * we use the origin only to avoid double-locale URLs.
 */
export async function gotoApp(
  page: Page,
  path: string,
  testInfo: TestInfo,
  options?: { marker?: string }
) {
  const baseUrl = testInfo.project.use.baseURL || '';
  const origin = new URL(baseUrl).origin;

  let targetUrl: string;

  if (pathHasLocalePrefix(path)) {
    // Path already has locale (e.g., /sq/pricing from routes.pricing(testInfo))
    // Use origin only to avoid double-locale like /sq/sq/pricing
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    targetUrl = `${origin}${normalizedPath}`;
  } else {
    // Path is locale-agnostic (e.g., /member from ensureAuthenticated)
    // Append to locale-prefixed baseURL
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    targetUrl = new URL(normalizedPath, normalizedBase).toString();
  }

  console.log(`[E2E Nav] ${targetUrl}`);
  await page.goto(targetUrl);

  const marker = options?.marker ?? 'page-ready';

  if (marker === 'body') {
    await expect(page.locator('body')).toBeVisible({ timeout: 15000 });
  } else {
    await expect(page.getByTestId(marker)).toBeVisible({ timeout: 15000 });
  }
}
